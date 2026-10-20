.class public interface abstract Lorg/apache/cordova/CordovaWebView;
.super Ljava/lang/Object;
.source "CordovaWebView.java"


# static fields
.field public static final CORDOVA_VERSION:Ljava/lang/String; = "10.1.1"


# virtual methods
.method public abstract backHistory()Z
.end method

.method public abstract canGoBack()Z
.end method

.method public abstract clearCache()V
.end method

.method public abstract clearCache(Z)V
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x0
        }
        names = {
            "b"
        }
    .end annotation

    .annotation runtime Ljava/lang/Deprecated;
    .end annotation
.end method

.method public abstract clearHistory()V
.end method

.method public abstract getContext()Landroid/content/Context;
.end method

.method public abstract getCookieManager()Lorg/apache/cordova/ICordovaCookieManager;
.end method

.method public abstract getEngine()Lorg/apache/cordova/CordovaWebViewEngine;
.end method

.method public abstract getPluginManager()Lorg/apache/cordova/PluginManager;
.end method

.method public abstract getPreferences()Lorg/apache/cordova/CordovaPreferences;
.end method

.method public abstract getResourceApi()Lorg/apache/cordova/CordovaResourceApi;
.end method

.method public abstract getUrl()Ljava/lang/String;
.end method

.method public abstract getView()Landroid/view/View;
.end method

.method public abstract handleDestroy()V
.end method

.method public abstract handlePause(Z)V
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x0
        }
        names = {
            "keepRunning"
        }
    .end annotation
.end method

.method public abstract handleResume(Z)V
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x0
        }
        names = {
            "keepRunning"
        }
    .end annotation
.end method

.method public abstract handleStart()V
.end method

.method public abstract handleStop()V
.end method

.method public abstract hideCustomView()V
    .annotation runtime Ljava/lang/Deprecated;
    .end annotation
.end method

.method public abstract init(Lorg/apache/cordova/CordovaInterface;Ljava/util/List;Lorg/apache/cordova/CordovaPreferences;)V
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x0,
            0x0,
            0x0
        }
        names = {
            "cordova",
            "pluginEntries",
            "preferences"
        }
    .end annotation

    .annotation system Ldalvik/annotation/Signature;
        value = {
            "(",
            "Lorg/apache/cordova/CordovaInterface;",
            "Ljava/util/List<",
            "Lorg/apache/cordova/PluginEntry;",
            ">;",
            "Lorg/apache/cordova/CordovaPreferences;",
            ")V"
        }
    .end annotation
.end method

.method public abstract isButtonPlumbedToJs(I)Z
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x0
        }
        names = {
            "keyCode"
        }
    .end annotation
.end method

.method public abstract isCustomViewShowing()Z
    .annotation runtime Ljava/lang/Deprecated;
    .end annotation
.end method

.method public abstract isInitialized()Z
.end method

.method public abstract loadUrl(Ljava/lang/String;)V
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x0
        }
        names = {
            "url"
        }
    .end annotation
.end method

.method public abstract loadUrlIntoView(Ljava/lang/String;Z)V
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x0,
            0x0
        }
        names = {
            "url",
            "recreatePlugins"
        }
    .end annotation
.end method

.method public abstract onNewIntent(Landroid/content/Intent;)V
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x0
        }
        names = {
            "intent"
        }
    .end annotation
.end method

.method public abstract postMessage(Ljava/lang/String;Ljava/lang/Object;)Ljava/lang/Object;
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x0,
            0x0
        }
        names = {
            "id",
            "data"
        }
    .end annotation
.end method

.method public abstract sendJavascript(Ljava/lang/String;)V
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x0
        }
        names = {
            "statememt"
        }
    .end annotation

    .annotation runtime Ljava/lang/Deprecated;
    .end annotation
.end method

.method public abstract sendPluginResult(Lorg/apache/cordova/PluginResult;Ljava/lang/String;)V
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x0,
            0x0
        }
        names = {
            "cr",
            "callbackId"
        }
    .end annotation
.end method

.method public abstract setButtonPlumbedToJs(IZ)V
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x0,
            0x0
        }
        names = {
            "keyCode",
            "override"
        }
    .end annotation
.end method

.method public abstract showCustomView(Landroid/view/View;Landroid/webkit/WebChromeClient$CustomViewCallback;)V
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x0,
            0x0
        }
        names = {
            "view",
            "callback"
        }
    .end annotation

    .annotation runtime Ljava/lang/Deprecated;
    .end annotation
.end method

.method public abstract showWebPage(Ljava/lang/String;ZZLjava/util/Map;)V
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x0,
            0x0,
            0x0,
            0x0
        }
        names = {
            "url",
            "openExternal",
            "clearHistory",
            "params"
        }
    .end annotation

    .annotation system Ldalvik/annotation/Signature;
        value = {
            "(",
            "Ljava/lang/String;",
            "ZZ",
            "Ljava/util/Map<",
            "Ljava/lang/String;",
            "Ljava/lang/Object;",
            ">;)V"
        }
    .end annotation
.end method

.method public abstract stopLoading()V
.end method
