import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android plugin.
    id("dev.flutter.flutter-gradle-plugin")
}

val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
if (keystorePropertiesFile.exists()) {
    keystorePropertiesFile.inputStream().use { keystoreProperties.load(it) }
}

fun signingProperty(propertyName: String, envName: String): String? =
    keystoreProperties.getProperty(propertyName)?.takeIf { it.isNotBlank() }
        ?: System.getenv(envName)?.takeIf { it.isNotBlank() }

val releaseStoreFile = signingProperty("storeFile", "ANDROID_KEYSTORE_FILE")
val releaseStorePassword = signingProperty("storePassword", "ANDROID_KEYSTORE_PASSWORD")
val releaseKeyAlias = signingProperty("keyAlias", "ANDROID_KEY_ALIAS")
val releaseKeyPassword = signingProperty("keyPassword", "ANDROID_KEY_PASSWORD")
val releaseSigningValues = mapOf(
    "storeFile / ANDROID_KEYSTORE_FILE" to releaseStoreFile,
    "storePassword / ANDROID_KEYSTORE_PASSWORD" to releaseStorePassword,
    "keyAlias / ANDROID_KEY_ALIAS" to releaseKeyAlias,
    "keyPassword / ANDROID_KEY_PASSWORD" to releaseKeyPassword,
)
val isReleaseBuild = gradle.startParameter.taskNames.any {
    it.contains("release", ignoreCase = true) || it.contains("bundle", ignoreCase = true)
}

if (isReleaseBuild) {
    val missingReleaseSigningValues = releaseSigningValues
        .filterValues { it.isNullOrBlank() }
        .keys

    if (missingReleaseSigningValues.isNotEmpty()) {
        throw GradleException(
            "Release signing config is missing: ${missingReleaseSigningValues.joinToString()}. " +
                "Set apps/mobile/android/key.properties or the ANDROID_* environment variables.",
        )
    }
}

android {
    namespace = "com.fromfedtochain.app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "com.fromfedtochain.app"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            keyAlias = releaseKeyAlias
            keyPassword = releaseKeyPassword
            storeFile = releaseStoreFile?.let { rootProject.file(it) }
            storePassword = releaseStorePassword
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
