# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.

# Keep native methods
-keepclasseswithmembernames class * {
    native <methods>;
}

# Keep Wails bridge classes
-keep class io.github.jim_ww.charshare.WailsBridge { *; }
-keep class io.github.jim_ww.charshare.WailsJSBridge { *; }
