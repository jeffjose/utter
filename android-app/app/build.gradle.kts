import java.util.Properties
import java.io.FileInputStream

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Load .env file from project root (two levels up from app/)
val envFile = file("../../.env")
val envProperties = Properties()
if (envFile.exists()) {
    envProperties.load(FileInputStream(envFile))
} else {
    throw GradleException(
        "No .env file found at ${envFile.absolutePath}. " +
        "Please copy .env.example to .env and fill in your credentials."
    )
}

android {
    namespace = "com.utter.android"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.utter.android"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // Inject environment variables into BuildConfig
        buildConfigField("String", "GOOGLE_CLIENT_ID", "\"${envProperties.getProperty("GOOGLE_ANDROID_CLIENT_ID")}\"")
        buildConfigField("String", "SERVER_URL", "\"${envProperties.getProperty("SERVER_URL", "ws://localhost:8080")}\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }

    kotlinOptions {
        jvmTarget = "1.8"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("com.google.android.material:material:1.11.0")
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")

    // WebSocket
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3")

    // JSON
    implementation("org.json:json:20231013")

    // Cryptography for E2E encryption
    implementation("com.google.crypto.tink:tink-android:1.13.0")

    // Google Sign-In for OAuth
    implementation("com.google.android.gms:play-services-auth:21.0.0")

    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.5")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.1")
}
