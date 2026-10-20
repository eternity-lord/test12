.class public Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;
.super Ljava/lang/Object;
.source "MockCordovaWebViewImpl.java"

# interfaces
.implements Lorg/apache/cordova/CordovaWebView;


# annotations
.annotation system Ldalvik/annotation/MemberClasses;
    value = {
        Lcom/getcapacitor/cordova/MockCordovaWebViewImpl$CapacitorEvalBridgeMode;
    }
.end annotation


# instance fields
.field private context:Landroid/content/Context;

.field private cookieManager:Lcom/getcapacitor/cordova/CapacitorCordovaCookieManager;

.field private cordova:Lorg/apache/cordova/CordovaInterface;

.field private hasPausedEver:Z

.field private nativeToJsMessageQueue:Lorg/apache/cordova/NativeToJsMessageQueue;

.field private pluginManager:Lorg/apache/cordova/PluginManager;

.field private preferences:Lorg/apache/cordova/CordovaPreferences;

.field private resourceApi:Lorg/apache/cordova/CordovaResourceApi;

.field private webView:Landroid/webkit/WebView;


# direct methods
.method public static synthetic $r8$lambda$5P7Mo4npmQcOjtTm9tp1elW11Gw(Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;Ljava/lang/String;Landroid/webkit/ValueCallback;)V
    .locals 0

    invoke-direct {p0, p1, p2}, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->lambda$eval$0(Ljava/lang/String;Landroid/webkit/ValueCallback;)V

    return-void
.end method

.method public constructor <init>(Landroid/content/Context;)V
    .locals 0

    .line 35
    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    iput-object p1, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->context:Landroid/content/Context;

    return-void
.end method

.method private synthetic lambda$eval$0(Ljava/lang/String;Landroid/webkit/ValueCallback;)V
    .locals 1

    iget-object v0, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->webView:Landroid/webkit/WebView;

    .line 193
    invoke-virtual {v0, p1, p2}, Landroid/webkit/WebView;->evaluateJavascript(Ljava/lang/String;Landroid/webkit/ValueCallback;)V

    return-void
.end method

.method static synthetic lambda$triggerDocumentEvent$1(Ljava/lang/String;)V
    .locals 0

    return-void
.end method


# virtual methods
.method public backHistory()Z
    .locals 1

    const/4 v0, 0x0

    return v0
.end method

.method public canGoBack()Z
    .locals 1

    const/4 v0, 0x0

    return v0
.end method

.method public clearCache()V
    .locals 0

    return-void
.end method

.method public clearCache(Z)V
    .locals 0
    .annotation runtime Ljava/lang/Deprecated;
    .end annotation

    return-void
.end method

.method public clearHistory()V
    .locals 0

    return-void
.end method

.method public eval(Ljava/lang/String;Landroid/webkit/ValueCallback;)V
    .locals 2
    .annotation system Ldalvik/annotation/Signature;
        value = {
            "(",
            "Ljava/lang/String;",
            "Landroid/webkit/ValueCallback<",
            "Ljava/lang/String;",
            ">;)V"
        }
    .end annotation

    .line 192
    new-instance v0, Landroid/os/Handler;

    iget-object v1, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->context:Landroid/content/Context;

    invoke-virtual {v1}, Landroid/content/Context;->getMainLooper()Landroid/os/Looper;

    move-result-object v1

    invoke-direct {v0, v1}, Landroid/os/Handler;-><init>(Landroid/os/Looper;)V

    .line 193
    new-instance v1, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl$$ExternalSyntheticLambda0;

    invoke-direct {v1, p0, p1, p2}, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl$$ExternalSyntheticLambda0;-><init>(Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;Ljava/lang/String;Landroid/webkit/ValueCallback;)V

    invoke-virtual {v0, v1}, Landroid/os/Handler;->post(Ljava/lang/Runnable;)Z

    return-void
.end method

.method public getContext()Landroid/content/Context;
    .locals 1

    iget-object v0, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->webView:Landroid/webkit/WebView;

    .line 262
    invoke-virtual {v0}, Landroid/webkit/WebView;->getContext()Landroid/content/Context;

    move-result-object v0

    return-object v0
.end method

.method public getCookieManager()Lorg/apache/cordova/ICordovaCookieManager;
    .locals 1

    iget-object v0, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->cookieManager:Lcom/getcapacitor/cordova/CapacitorCordovaCookieManager;

    return-object v0
.end method

.method public getEngine()Lorg/apache/cordova/CordovaWebViewEngine;
    .locals 1

    const/4 v0, 0x0

    return-object v0
.end method

.method public getPluginManager()Lorg/apache/cordova/PluginManager;
    .locals 1

    iget-object v0, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->pluginManager:Lorg/apache/cordova/PluginManager;

    return-object v0
.end method

.method public getPreferences()Lorg/apache/cordova/CordovaPreferences;
    .locals 1

    iget-object v0, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->preferences:Lorg/apache/cordova/CordovaPreferences;

    return-object v0
.end method

.method public getResourceApi()Lorg/apache/cordova/CordovaResourceApi;
    .locals 1

    iget-object v0, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->resourceApi:Lorg/apache/cordova/CordovaResourceApi;

    return-object v0
.end method

.method public getUrl()Ljava/lang/String;
    .locals 1

    iget-object v0, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->webView:Landroid/webkit/WebView;

    .line 257
    invoke-virtual {v0}, Landroid/webkit/WebView;->getUrl()Ljava/lang/String;

    move-result-object v0

    return-object v0
.end method

.method public getView()Landroid/view/View;
    .locals 1

    iget-object v0, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->webView:Landroid/webkit/WebView;

    return-object v0
.end method

.method public handleDestroy()V
    .locals 1

    .line 179
    invoke-virtual {p0}, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->isInitialized()Z

    move-result v0

    if-nez v0, :cond_0

    return-void

    :cond_0
    iget-object v0, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->pluginManager:Lorg/apache/cordova/PluginManager;

    .line 182
    invoke-virtual {v0}, Lorg/apache/cordova/PluginManager;->onDestroy()V

    return-void
.end method

.method public handlePause(Z)V
    .locals 2

    .line 129
    invoke-virtual {p0}, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->isInitialized()Z

    move-result v0

    if-nez v0, :cond_0

    return-void

    :cond_0
    const/4 v0, 0x1

    iput-boolean v0, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->hasPausedEver:Z

    iget-object v1, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->pluginManager:Lorg/apache/cordova/PluginManager;

    .line 133
    invoke-virtual {v1, p1}, Lorg/apache/cordova/PluginManager;->onPause(Z)V

    const-string v1, "pause"

    .line 134
    invoke-virtual {p0, v1}, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->triggerDocumentEvent(Ljava/lang/String;)V

    if-nez p1, :cond_1

    .line 138
    invoke-virtual {p0, v0}, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->setPaused(Z)V

    :cond_1
    return-void
.end method

.method public handleResume(Z)V
    .locals 1

    .line 151
    invoke-virtual {p0}, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->isInitialized()Z

    move-result v0

    if-nez v0, :cond_0

    return-void

    :cond_0
    const/4 v0, 0x0

    .line 154
    invoke-virtual {p0, v0}, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->setPaused(Z)V

    iget-object v0, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->pluginManager:Lorg/apache/cordova/PluginManager;

    .line 155
    invoke-virtual {v0, p1}, Lorg/apache/cordova/PluginManager;->onResume(Z)V

    iget-boolean p1, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->hasPausedEver:Z

    if-eqz p1, :cond_1

    const-string p1, "resume"

    .line 157
    invoke-virtual {p0, p1}, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->triggerDocumentEvent(Ljava/lang/String;)V

    :cond_1
    return-void
.end method

.method public handleStart()V
    .locals 1

    .line 163
    invoke-virtual {p0}, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->isInitialized()Z

    move-result v0

    if-nez v0, :cond_0

    return-void

    :cond_0
    iget-object v0, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->pluginManager:Lorg/apache/cordova/PluginManager;

    .line 166
    invoke-virtual {v0}, Lorg/apache/cordova/PluginManager;->onStart()V

    return-void
.end method

.method public handleStop()V
    .locals 1

    .line 171
    invoke-virtual {p0}, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->isInitialized()Z

    move-result v0

    if-nez v0, :cond_0

    return-void

    :cond_0
    iget-object v0, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->pluginManager:Lorg/apache/cordova/PluginManager;

    .line 174
    invoke-virtual {v0}, Lorg/apache/cordova/PluginManager;->onStop()V

    return-void
.end method

.method public hideCustomView()V
    .locals 0
    .annotation runtime Ljava/lang/Deprecated;
    .end annotation

    return-void
.end method

.method public init(Lorg/apache/cordova/CordovaInterface;Ljava/util/List;Lorg/apache/cordova/CordovaPreferences;)V
    .locals 0
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

    iput-object p1, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->cordova:Lorg/apache/cordova/CordovaInterface;

    iput-object p3, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->preferences:Lorg/apache/cordova/CordovaPreferences;

    .line 43
    new-instance p1, Lorg/apache/cordova/PluginManager;

    iget-object p3, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->cordova:Lorg/apache/cordova/CordovaInterface;

    invoke-direct {p1, p0, p3, p2}, Lorg/apache/cordova/PluginManager;-><init>(Lorg/apache/cordova/CordovaWebView;Lorg/apache/cordova/CordovaInterface;Ljava/util/Collection;)V

    iput-object p1, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->pluginManager:Lorg/apache/cordova/PluginManager;

    .line 44
    new-instance p1, Lorg/apache/cordova/CordovaResourceApi;

    iget-object p2, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->context:Landroid/content/Context;

    iget-object p3, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->pluginManager:Lorg/apache/cordova/PluginManager;

    invoke-direct {p1, p2, p3}, Lorg/apache/cordova/CordovaResourceApi;-><init>(Landroid/content/Context;Lorg/apache/cordova/PluginManager;)V

    iput-object p1, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->resourceApi:Lorg/apache/cordova/CordovaResourceApi;

    iget-object p1, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->pluginManager:Lorg/apache/cordova/PluginManager;

    .line 45
    invoke-virtual {p1}, Lorg/apache/cordova/PluginManager;->init()V

    return-void
.end method

.method public init(Lorg/apache/cordova/CordovaInterface;Ljava/util/List;Lorg/apache/cordova/CordovaPreferences;Landroid/webkit/WebView;)V
    .locals 0
    .annotation system Ldalvik/annotation/Signature;
        value = {
            "(",
            "Lorg/apache/cordova/CordovaInterface;",
            "Ljava/util/List<",
            "Lorg/apache/cordova/PluginEntry;",
            ">;",
            "Lorg/apache/cordova/CordovaPreferences;",
            "Landroid/webkit/WebView;",
            ")V"
        }
    .end annotation

    iput-object p1, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->cordova:Lorg/apache/cordova/CordovaInterface;

    iput-object p4, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->webView:Landroid/webkit/WebView;

    iput-object p3, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->preferences:Lorg/apache/cordova/CordovaPreferences;

    .line 52
    new-instance p1, Lorg/apache/cordova/PluginManager;

    iget-object p3, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->cordova:Lorg/apache/cordova/CordovaInterface;

    invoke-direct {p1, p0, p3, p2}, Lorg/apache/cordova/PluginManager;-><init>(Lorg/apache/cordova/CordovaWebView;Lorg/apache/cordova/CordovaInterface;Ljava/util/Collection;)V

    iput-object p1, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->pluginManager:Lorg/apache/cordova/PluginManager;

    .line 53
    new-instance p1, Lorg/apache/cordova/CordovaResourceApi;

    iget-object p2, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->context:Landroid/content/Context;

    iget-object p3, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->pluginManager:Lorg/apache/cordova/PluginManager;

    invoke-direct {p1, p2, p3}, Lorg/apache/cordova/CordovaResourceApi;-><init>(Landroid/content/Context;Lorg/apache/cordova/PluginManager;)V

    iput-object p1, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->resourceApi:Lorg/apache/cordova/CordovaResourceApi;

    .line 54
    new-instance p1, Lorg/apache/cordova/NativeToJsMessageQueue;

    invoke-direct {p1}, Lorg/apache/cordova/NativeToJsMessageQueue;-><init>()V

    iput-object p1, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->nativeToJsMessageQueue:Lorg/apache/cordova/NativeToJsMessageQueue;

    .line 55
    new-instance p2, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl$CapacitorEvalBridgeMode;

    iget-object p3, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->cordova:Lorg/apache/cordova/CordovaInterface;

    invoke-direct {p2, p4, p3}, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl$CapacitorEvalBridgeMode;-><init>(Landroid/webkit/WebView;Lorg/apache/cordova/CordovaInterface;)V

    invoke-virtual {p1, p2}, Lorg/apache/cordova/NativeToJsMessageQueue;->addBridgeMode(Lorg/apache/cordova/NativeToJsMessageQueue$BridgeMode;)V

    iget-object p1, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->nativeToJsMessageQueue:Lorg/apache/cordova/NativeToJsMessageQueue;

    const/4 p2, 0x0

    .line 56
    invoke-virtual {p1, p2}, Lorg/apache/cordova/NativeToJsMessageQueue;->setBridgeMode(I)V

    .line 57
    new-instance p1, Lcom/getcapacitor/cordova/CapacitorCordovaCookieManager;

    invoke-direct {p1, p4}, Lcom/getcapacitor/cordova/CapacitorCordovaCookieManager;-><init>(Landroid/webkit/WebView;)V

    iput-object p1, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->cookieManager:Lcom/getcapacitor/cordova/CapacitorCordovaCookieManager;

    iget-object p1, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->pluginManager:Lorg/apache/cordova/PluginManager;

    .line 58
    invoke-virtual {p1}, Lorg/apache/cordova/PluginManager;->init()V

    return-void
.end method

.method public isButtonPlumbedToJs(I)Z
    .locals 0

    const/4 p1, 0x0

    return p1
.end method

.method public isCustomViewShowing()Z
    .locals 1
    .annotation runtime Ljava/lang/Deprecated;
    .end annotation

    const/4 v0, 0x0

    return v0
.end method

.method public isInitialized()Z
    .locals 1

    iget-object v0, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->cordova:Lorg/apache/cordova/CordovaInterface;

    if-eqz v0, :cond_0

    const/4 v0, 0x1

    goto :goto_0

    :cond_0
    const/4 v0, 0x0

    :goto_0
    return v0
.end method

.method public loadUrl(Ljava/lang/String;)V
    .locals 1

    const/4 v0, 0x1

    .line 267
    invoke-virtual {p0, p1, v0}, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->loadUrlIntoView(Ljava/lang/String;Z)V

    return-void
.end method

.method public loadUrlIntoView(Ljava/lang/String;Z)V
    .locals 0

    const-string p2, "about:blank"

    .line 98
    invoke-virtual {p1, p2}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result p2

    if-nez p2, :cond_1

    const-string p2, "javascript:"

    invoke-virtual {p1, p2}, Ljava/lang/String;->startsWith(Ljava/lang/String;)Z

    move-result p2

    if-eqz p2, :cond_0

    goto :goto_0

    :cond_0
    return-void

    :cond_1
    :goto_0
    iget-object p2, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->webView:Landroid/webkit/WebView;

    .line 99
    invoke-virtual {p2, p1}, Landroid/webkit/WebView;->loadUrl(Ljava/lang/String;)V

    return-void
.end method

.method public onNewIntent(Landroid/content/Intent;)V
    .locals 1

    iget-object v0, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->pluginManager:Lorg/apache/cordova/PluginManager;

    if-eqz v0, :cond_0

    .line 145
    invoke-virtual {v0, p1}, Lorg/apache/cordova/PluginManager;->onNewIntent(Landroid/content/Intent;)V

    :cond_0
    return-void
.end method

.method public postMessage(Ljava/lang/String;Ljava/lang/Object;)Ljava/lang/Object;
    .locals 1

    iget-object v0, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->pluginManager:Lorg/apache/cordova/PluginManager;

    .line 272
    invoke-virtual {v0, p1, p2}, Lorg/apache/cordova/PluginManager;->postMessage(Ljava/lang/String;Ljava/lang/Object;)Ljava/lang/Object;

    move-result-object p1

    return-object p1
.end method

.method public sendJavascript(Ljava/lang/String;)V
    .locals 1
    .annotation runtime Ljava/lang/Deprecated;
    .end annotation

    iget-object v0, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->nativeToJsMessageQueue:Lorg/apache/cordova/NativeToJsMessageQueue;

    .line 188
    invoke-virtual {v0, p1}, Lorg/apache/cordova/NativeToJsMessageQueue;->addJavaScript(Ljava/lang/String;)V

    return-void
.end method

.method public sendPluginResult(Lorg/apache/cordova/PluginResult;Ljava/lang/String;)V
    .locals 1

    iget-object v0, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->nativeToJsMessageQueue:Lorg/apache/cordova/NativeToJsMessageQueue;

    .line 232
    invoke-virtual {v0, p1, p2}, Lorg/apache/cordova/NativeToJsMessageQueue;->addPluginResult(Lorg/apache/cordova/PluginResult;Ljava/lang/String;)V

    return-void
.end method

.method public setButtonPlumbedToJs(IZ)V
    .locals 0

    return-void
.end method

.method public setPaused(Z)V
    .locals 0

    if-eqz p1, :cond_0

    iget-object p1, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->webView:Landroid/webkit/WebView;

    .line 277
    invoke-virtual {p1}, Landroid/webkit/WebView;->onPause()V

    iget-object p1, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->webView:Landroid/webkit/WebView;

    .line 278
    invoke-virtual {p1}, Landroid/webkit/WebView;->pauseTimers()V

    goto :goto_0

    :cond_0
    iget-object p1, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->webView:Landroid/webkit/WebView;

    .line 280
    invoke-virtual {p1}, Landroid/webkit/WebView;->onResume()V

    iget-object p1, p0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->webView:Landroid/webkit/WebView;

    .line 281
    invoke-virtual {p1}, Landroid/webkit/WebView;->resumeTimers()V

    :goto_0
    return-void
.end method

.method public showCustomView(Landroid/view/View;Landroid/webkit/WebChromeClient$CustomViewCallback;)V
    .locals 0
    .annotation runtime Ljava/lang/Deprecated;
    .end annotation

    return-void
.end method

.method public showWebPage(Ljava/lang/String;ZZLjava/util/Map;)V
    .locals 0
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

    return-void
.end method

.method public stopLoading()V
    .locals 0

    return-void
.end method

.method public triggerDocumentEvent(Ljava/lang/String;)V
    .locals 2

    .line 197
    new-instance v0, Ljava/lang/StringBuilder;

    const-string v1, "window.Capacitor.triggerEvent(\'"

    invoke-direct {v0, v1}, Ljava/lang/StringBuilder;-><init>(Ljava/lang/String;)V

    invoke-virtual {v0, p1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    const-string p1, "\', \'document\');"

    invoke-virtual {v0, p1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v0}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object p1

    new-instance v0, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl$$ExternalSyntheticLambda1;

    invoke-direct {v0}, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl$$ExternalSyntheticLambda1;-><init>()V

    invoke-virtual {p0, p1, v0}, Lcom/getcapacitor/cordova/MockCordovaWebViewImpl;->eval(Ljava/lang/String;Landroid/webkit/ValueCallback;)V

    return-void
.end method
