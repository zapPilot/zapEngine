import Foundation
import Security

// Export only Apple signing identities, never the whole login keychain.
let prefixes = ["Apple Development:", "Apple Distribution:", "iPhone Developer:",
                "iPhone Distribution:", "Mac Developer:", "Mac App Distribution:",
                "Mac Installer Distribution:", "Developer ID Application:", "Developer ID Installer:"]
let output = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
guard let password = readLine(), !password.isEmpty else { exit(2) }
var result: CFTypeRef?
let query: [String: Any] = [kSecClass as String: kSecClassIdentity,
    kSecReturnRef as String: true, kSecMatchLimit as String: kSecMatchLimitAll]
let status = SecItemCopyMatching(query as CFDictionary, &result)
var exported: [[String: Any]] = []
var failures: [[String: Any]] = []
func saveReport() {
    let report: [String: Any] = ["exported": exported, "failures": failures]
    do {
        let data = try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys])
        try data.write(to: output.appendingPathComponent("identities.json"), options: .atomic)
    } catch { exit(2) }
}
saveReport()

if status != errSecSuccess && status != errSecItemNotFound {
    failures.append(["status": Int(status), "operation": "query signing identities"])
}
if status == errSecSuccess, let identities = result as? [SecIdentity] {
    for (index, identity) in identities.enumerated() {
        var certificate: SecCertificate?
        guard SecIdentityCopyCertificate(identity, &certificate) == errSecSuccess,
              let certificate else { failures.append(["operation": "read identity certificate"]); continue }
        var commonName: CFString?
        guard SecCertificateCopyCommonName(certificate, &commonName) == errSecSuccess,
              let commonName else { failures.append(["operation": "read identity name"]); continue }
        let name = commonName as String
        guard prefixes.contains(where: { name.hasPrefix($0) }) else { continue }
        let platform = name.hasPrefix("Developer ID") || name.hasPrefix("Mac") ? "macos" : "ios"
        let filename = "\(platform)-identity-\(index).p12"
        let passphrase = password as CFString
        var parameters = SecItemImportExportKeyParameters()
        parameters.version = UInt32(SEC_KEY_IMPORT_EXPORT_PARAMS_VERSION)
        parameters.passphrase = Unmanaged.passUnretained(passphrase)
        var data: CFData?
        failures.append(["name": name, "operation": "private-key export pending or interrupted"])
        saveReport()
        let exportStatus = SecItemExport(identity, .formatPKCS12, [], &parameters, &data)
        failures.removeLast()
        if exportStatus == errSecSuccess, let data {
            do {
                let path = output.appendingPathComponent(filename)
                try (data as Data).write(to: path)
                try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: path.path)
                exported.append(["name": name, "platform": platform, "file": filename])
            } catch { failures.append(["name": name, "operation": "write exported identity"]); }
        } else { failures.append(["name": name, "status": Int(exportStatus), "operation": "export private key"]); }
        saveReport()
    }
}
saveReport()
exit(failures.isEmpty ? 0 : 1)
