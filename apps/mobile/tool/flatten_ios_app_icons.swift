#!/usr/bin/env swift

import AppKit
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

struct AppIcon {
  let filename: String
  let pixels: Int
}

let icons = [
  AppIcon(filename: "Icon-App-20x20@1x.png", pixels: 20),
  AppIcon(filename: "Icon-App-20x20@2x.png", pixels: 40),
  AppIcon(filename: "Icon-App-20x20@3x.png", pixels: 60),
  AppIcon(filename: "Icon-App-29x29@1x.png", pixels: 29),
  AppIcon(filename: "Icon-App-29x29@2x.png", pixels: 58),
  AppIcon(filename: "Icon-App-29x29@3x.png", pixels: 87),
  AppIcon(filename: "Icon-App-40x40@1x.png", pixels: 40),
  AppIcon(filename: "Icon-App-40x40@2x.png", pixels: 80),
  AppIcon(filename: "Icon-App-40x40@3x.png", pixels: 120),
  AppIcon(filename: "Icon-App-60x60@2x.png", pixels: 120),
  AppIcon(filename: "Icon-App-60x60@3x.png", pixels: 180),
  AppIcon(filename: "Icon-App-76x76@1x.png", pixels: 76),
  AppIcon(filename: "Icon-App-76x76@2x.png", pixels: 152),
  AppIcon(filename: "Icon-App-83.5x83.5@2x.png", pixels: 167),
  AppIcon(filename: "Icon-App-1024x1024@1x.png", pixels: 1024),
]

let currentDirectory = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let scriptURL = URL(fileURLWithPath: CommandLine.arguments[0], relativeTo: currentDirectory)
  .standardizedFileURL
let mobileRoot = scriptURL.deletingLastPathComponent().deletingLastPathComponent()
let repoRoot = mobileRoot.deletingLastPathComponent().deletingLastPathComponent()
let sourceURL = repoRoot.appendingPathComponent("apps/landing-page/public/zap-pilot-icon.png")
let appIconDirectory = mobileRoot.appendingPathComponent(
  "ios/Runner/Assets.xcassets/AppIcon.appiconset"
)

guard let sourceImage = NSImage(contentsOf: sourceURL) else {
  fatalError("Unable to load source icon at \(sourceURL.path)")
}

let background = CGColor(red: 0x0a / 255, green: 0x0a / 255, blue: 0x0a / 255, alpha: 1)
let colorSpace = CGColorSpaceCreateDeviceRGB()

func writeIcon(_ icon: AppIcon) {
  let size = icon.pixels
  let bitmapInfo = CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.noneSkipLast.rawValue

  guard
    let context = CGContext(
      data: nil,
      width: size,
      height: size,
      bitsPerComponent: 8,
      bytesPerRow: size * 4,
      space: colorSpace,
      bitmapInfo: bitmapInfo
    )
  else {
    fatalError("Unable to create bitmap context for \(icon.filename)")
  }

  context.interpolationQuality = .high
  context.setFillColor(background)
  context.fill(CGRect(x: 0, y: 0, width: size, height: size))

  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: false)
  sourceImage.draw(
    in: CGRect(x: 0, y: 0, width: size, height: size),
    from: .zero,
    operation: .sourceOver,
    fraction: 1
  )
  NSGraphicsContext.restoreGraphicsState()

  guard let image = context.makeImage() else {
    fatalError("Unable to create CGImage for \(icon.filename)")
  }

  let outputURL = appIconDirectory.appendingPathComponent(icon.filename)
  guard
    let destination = CGImageDestinationCreateWithURL(
      outputURL as CFURL,
      UTType.png.identifier as CFString,
      1,
      nil
    )
  else {
    fatalError("Unable to create PNG destination for \(outputURL.path)")
  }

  CGImageDestinationAddImage(destination, image, nil)
  guard CGImageDestinationFinalize(destination) else {
    fatalError("Unable to write \(outputURL.path)")
  }
}

for icon in icons {
  writeIcon(icon)
}

print("Generated \(icons.count) opaque iOS app icons.")
