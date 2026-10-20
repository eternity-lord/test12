.class public Lorg/apache/cordova/engine/SystemWebViewEngine;
.super Ljava/lang/Object;
.source "SystemWebViewEngine.java"

# interfaces
.implements Lorg/apache/cordova/CordovaWebViewEngine;


# static fields
.field public static final TAG:Ljava/lang/String; = "SystemWebViewEngine"


# instance fields
.field protected bridge:Lorg/apache/cordova/CordovaBridge;

.field protected client:Lorg/apache/cordova/CordovaWebViewEngine$Client;

.field protected final cookieManager:Lorg/apache/cordova/engine/SystemCookieManager;

.field protected cordova:Lorg/apache/cordova/CordovaInterface;

.field protected nativeToJsMessageQueue:Lorg/apache/cordova/NativeToJsMessageQueue;

.field protected parentWebView:Lorg/apache/cordova/CordovaWebView;

.field protected pluginManager:Lorg/apache/cordova/PluginManager;

.field protected preferences:Lorg/apache/cordova/CordovaPreferences;

.field private receiver:Landroid/content/BroadcastReceiver;

.field protected resourceApi:Lorg/apache/cordova/CordovaResourceApi;

.field protected final webView:Lorg/apache/cordova/engine/SystemWebView;


# direct methods
.method public constructor <init>(Landroid/content/Context;Lorg/apache/cordova/CordovaPreferences;)V
    .locals 1
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x0,
            0x0
        }
        names = {
            "context",
            "preferences"
        }
    .end annotation

    .line 76
    new-instance v0, Lorg/apache/cordova/engine/SystemWebView;

    invoke-direct {v0, p1}, Lorg/apache/cordova/engine/SystemWebView;-><init>(Landroid/content/Context;)V

    invoke-direct {p0, v0, p2}, Lorg/apache/cordova/engine/SystemWebViewEngine;-><init>(Lorg/apache/cordova/engine/SystemWebView;Lorg/apache/cordova/CordovaPreferences;)V

    return-void
.end method

.method public constructor <init>(Lorg/apache/cordova/engine/SystemWebView;)V
    .locals 1
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x0
        }
        names = {
            "webView"
        }
    .end annotation

    const/4 v0, 0x0

    .line 80
    invoke-direct {p0, p1, v0}, Lorg/apache/cordova/engine/SystemWebViewEngine;-><init>(Lorg/apache/cordova/engine/SystemWebView;Lorg/apache/cordova/CordovaPreferences;)V

    return-void
.end method

.method public constructor <init>(Lorg/apache/cordova/engine/SystemWebView;Lorg/apache/cordova/CordovaPreferences;)V
    .locals 0
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x0,
            0x0
        }
        names = {
            "webView",
            "preferences"
        }
    .end annotation

    .line 83
    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    iput-object p2, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->preferences:Lorg/apache/cordova/CordovaPreferences;

    iput-object p1, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->webView:Lorg/apache/cordova/engine/SystemWebView;

    .line 86
    new-instance p2, Lorg/apache/cordova/engine/SystemCookieManager;

    invoke-direct {p2, p1}, Lorg/apache/cordova/engine/SystemCookieManager;-><init>(Landroid/webkit/WebView;)V

    iput-object p2, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->cookieManager:Lorg/apache/cordova/engine/SystemCookieManager;

    return-void
.end method

.method private enableRemoteDebugging()V
    .locals 3

    const/4 v0, 0x1

    .line 224
    :try_start_0
    invoke-static {v0}, Landroid/webkit/WebView;->setWebContentsDebuggingEnabled(Z)V
    :try_end_0
    .catch Ljava/lang/IllegalArgumentException; {:try_start_0 .. :try_end_0} :catch_0

    goto :goto_0

    :catch_0
    move-exception v0

    const-string v1, "SystemWebViewEngine"

    const-string v2, "You have one job! To turn on Remote Web Debugging! YOU HAVE FAILED! "

    .line 226
    invoke-static {v1, v2}, Lorg/apache/cordova/LOG;->d(Ljava/lang/String;Ljava/lang/String;)V

    .line 227
    invoke-virtual {v0}, Ljava/lang/IllegalArgumentException;->printStackTrace()V

    :goto_0
    return-void
.end method

.method private static exposeJsInterface(Landroid/webkit/WebView;Lorg/apache/cordova/CordovaBridge;)V
    .locals 1
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x0,
            0x0
        }
        names = {
            "webView",
            "bridge"
        }
    .end annotation

    .line 234
    new-instance v0, Lorg/apache/cordova/engine/SystemExposedJsApi;

    invoke-direct {v0, p1}, Lorg/apache/cordova/engine/SystemExposedJsApi;-><init>(Lorg/apache/cordova/CordovaBridge;)V

    const-string p1, "_cordovaNative"

    .line 235
    invoke-virtual {p0, v0, p1}, Landroid/webkit/WebView;->addJavascriptInterface(Ljava/lang/Object;Ljava/lang/String;)V

    return-void
.end method

.method private initWebViewSettings()V
    .locals 6

    iget-object v0, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->webView:Lorg/apache/cordova/engine/SystemWebView;

    const/4 v1, 0x0

    .line 147
    invoke-virtual {v0, v1}, Lorg/apache/cordova/engine/SystemWebView;->setInitialScale(I)V

    iget-object v0, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->webView:Lorg/apache/cordova/engine/SystemWebView;

    .line 148
    invoke-virtual {v0, v1}, Lorg/apache/cordova/engine/SystemWebView;->setVerticalScrollBarEnabled(Z)V

    iget-object v0, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->webView:Lorg/apache/cordova/engine/SystemWebView;

    .line 150
    invoke-virtual {v0}, Lorg/apache/cordova/engine/SystemWebView;->getSettings()Landroid/webkit/WebSettings;

    move-result-object v0

    const/4 v2, 0x1

    .line 151
    invoke-virtual {v0, v2}, Landroid/webkit/WebSettings;->setJavaScriptEnabled(Z)V

    .line 152
    invoke-virtual {v0, v2}, Landroid/webkit/WebSettings;->setJavaScriptCanOpenWindowsAutomatically(Z)V

    .line 153
    sget-object v3, Landroid/webkit/WebSettings$LayoutAlgorithm;->NORMAL:Landroid/webkit/WebSettings$LayoutAlgorithm;

    invoke-virtual {v0, v3}, Landroid/webkit/WebSettings;->setLayoutAlgorithm(Landroid/webkit/WebSettings$LayoutAlgorithm;)V

    .line 155
    sget-object v3, Landroid/os/Build;->MANUFACTURER:Ljava/lang/String;

    .line 156
    new-instance v4, Ljava/lang/StringBuilder;

    const-string v5, "CordovaWebView is running on device made by: "

    invoke-direct {v4, v5}, Ljava/lang/StringBuilder;-><init>(Ljava/lang/String;)V

    invoke-virtual {v4, v3}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v4}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object v3

    const-string v4, "SystemWebViewEngine"

    invoke-static {v4, v3}, Lorg/apache/cordova/LOG;->d(Ljava/lang/String;Ljava/lang/String;)V

    .line 160
    invoke-virtual {v0, v1}, Landroid/webkit/WebSettings;->setSaveFormData(Z)V

    iget-object v3, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->preferences:Lorg/apache/cordova/CordovaPreferences;

    const-string v5, "AndroidInsecureFileModeEnabled"

    .line 162
    invoke-virtual {v3, v5, v1}, Lorg/apache/cordova/CordovaPreferences;->getBoolean(Ljava/lang/String;Z)Z

    move-result v3

    if-eqz v3, :cond_0

    const-string v3, "Enabled insecure file access"

    .line 165
    invoke-static {v4, v3}, Lorg/apache/cordova/LOG;->d(Ljava/lang/String;Ljava/lang/String;)V

    .line 166
    invoke-virtual {v0, v2}, Landroid/webkit/WebSettings;->setAllowFileAccess(Z)V

    .line 167
    invoke-virtual {v0, v2}, Landroid/webkit/WebSettings;->setAllowUniversalAccessFromFileURLs(Z)V

    .line 170
    :cond_0
    invoke-virtual {v0, v1}, Landroid/webkit/WebSettings;->setMediaPlaybackRequiresUserGesture(Z)V

    iget-object v3, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->webView:Lorg/apache/cordova/engine/SystemWebView;

    .line 174
    invoke-virtual {v3}, Lorg/apache/cordova/engine/SystemWebView;->getContext()Landroid/content/Context;

    move-result-object v3

    invoke-virtual {v3}, Landroid/content/Context;->getApplicationContext()Landroid/content/Context;

    move-result-object v3

    const-string v4, "database"

    invoke-virtual {v3, v4, v1}, Landroid/content/Context;->getDir(Ljava/lang/String;I)Ljava/io/File;

    move-result-object v1

    invoke-virtual {v1}, Ljava/io/File;->getPath()Ljava/lang/String;

    move-result-object v1

    .line 175
    invoke-virtual {v0, v2}, Landroid/webkit/WebSettings;->setDatabaseEnabled(Z)V

    iget-object v3, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->webView:Lorg/apache/cordova/engine/SystemWebView;

    .line 178
    invoke-virtual {v3}, Lorg/apache/cordova/engine/SystemWebView;->getContext()Landroid/content/Context;

    move-result-object v3

    invoke-virtual {v3}, Landroid/content/Context;->getApplicationContext()Landroid/content/Context;

    move-result-object v3

    invoke-virtual {v3}, Landroid/content/Context;->getApplicationInfo()Landroid/content/pm/ApplicationInfo;

    move-result-object v3

    .line 179
    iget v3, v3, Landroid/content/pm/ApplicationInfo;->flags:I

    and-int/lit8 v3, v3, 0x2

    if-eqz v3, :cond_1

    .line 180
    invoke-direct {p0}, Lorg/apache/cordova/engine/SystemWebViewEngine;->enableRemoteDebugging()V

    .line 184
    :cond_1
    invoke-virtual {v0, v1}, Landroid/webkit/WebSettings;->setGeolocationDatabasePath(Ljava/lang/String;)V

    .line 187
    invoke-virtual {v0, v2}, Landroid/webkit/WebSettings;->setDomStorageEnabled(Z)V

    .line 190
    invoke-virtual {v0, v2}, Landroid/webkit/WebSettings;->setGeolocationEnabled(Z)V

    .line 194
    invoke-virtual {v0}, Landroid/webkit/WebSettings;->getUserAgentString()Ljava/lang/String;

    move-result-object v1

    iget-object v2, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->preferences:Lorg/apache/cordova/CordovaPreferences;

    const-string v3, "OverrideUserAgent"

    const/4 v4, 0x0

    .line 197
    invoke-virtual {v2, v3, v4}, Lorg/apache/cordova/CordovaPreferences;->getString(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;

    move-result-object v2

    if-eqz v2, :cond_2

    .line 199
    invoke-virtual {v0, v2}, Landroid/webkit/WebSettings;->setUserAgentString(Ljava/lang/String;)V

    goto :goto_0

    :cond_2
    iget-object v2, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->preferences:Lorg/apache/cordova/CordovaPreferences;

    const-string v3, "AppendUserAgent"

    .line 201
    invoke-virtual {v2, v3, v4}, Lorg/apache/cordova/CordovaPreferences;->getString(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;

    move-result-object v2

    if-eqz v2, :cond_3

    .line 203
    new-instance v3, Ljava/lang/StringBuilder;

    invoke-direct {v3}, Ljava/lang/StringBuilder;-><init>()V

    invoke-virtual {v3, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    const-string v1, " "

    invoke-virtual {v3, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v3, v2}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v3}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object v1

    invoke-virtual {v0, v1}, Landroid/webkit/WebSettings;->setUserAgentString(Ljava/lang/String;)V

    .line 208
    :cond_3
    :goto_0
    new-instance v1, Landroid/content/IntentFilter;

    invoke-direct {v1}, Landroid/content/IntentFilter;-><init>()V

    const-string v2, "android.intent.action.CONFIGURATION_CHANGED"

    .line 209
    invoke-virtual {v1, v2}, Landroid/content/IntentFilter;->addAction(Ljava/lang/String;)V

    iget-object v2, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->receiver:Landroid/content/BroadcastReceiver;

    if-nez v2, :cond_4

    .line 211
    new-instance v2, Lorg/apache/cordova/engine/SystemWebViewEngine$2;

    invoke-direct {v2, p0, v0}, Lorg/apache/cordova/engine/SystemWebViewEngine$2;-><init>(Lorg/apache/cordova/engine/SystemWebViewEngine;Landroid/webkit/WebSettings;)V

    iput-object v2, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->receiver:Landroid/content/BroadcastReceiver;

    iget-object v0, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->webView:Lorg/apache/cordova/engine/SystemWebView;

    .line 217
    invoke-virtual {v0}, Lorg/apache/cordova/engine/SystemWebView;->getContext()Landroid/content/Context;

    move-result-object v0

    iget-object v2, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->receiver:Landroid/content/BroadcastReceiver;

    invoke-virtual {v0, v2, v1}, Landroid/content/Context;->registerReceiver(Landroid/content/BroadcastReceiver;Landroid/content/IntentFilter;)Landroid/content/Intent;

    :cond_4
    return-void
.end method


# virtual methods
.method public canGoBack()Z
    .locals 1

    iget-object v0, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->webView:Lorg/apache/cordova/engine/SystemWebView;

    .line 269
    invoke-virtual {v0}, Lorg/apache/cordova/engine/SystemWebView;->canGoBack()Z

    move-result v0

    return v0
.end method

.method public clearCache()V
    .locals 2

    iget-object v0, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->webView:Lorg/apache/cordova/engine/SystemWebView;

    const/4 v1, 0x1

    .line 259
    invoke-virtual {v0, v1}, Lorg/apache/cordova/engine/SystemWebView;->clearCache(Z)V

    return-void
.end method

.method public clearHistory()V
    .locals 1

    iget-object v0, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->webView:Lorg/apache/cordova/engine/SystemWebView;

    .line 264
    invoke-virtual {v0}, Lorg/apache/cordova/engine/SystemWebView;->clearHistory()V

    return-void
.end method

.method public destroy()V
    .locals 3

    iget-object v0, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->webView:Lorg/apache/cordova/engine/SystemWebView;

    .line 301
    iget-object v0, v0, Lorg/apache/cordova/engine/SystemWebView;->chromeClient:Lorg/apache/cordova/engine/SystemWebChromeClient;

    invoke-virtual {v0}, Lorg/apache/cordova/engine/SystemWebChromeClient;->destroyLastDialog()V

    iget-object v0, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->webView:Lorg/apache/cordova/engine/SystemWebView;

    .line 302
    invoke-virtual {v0}, Lorg/apache/cordova/engine/SystemWebView;->destroy()V

    iget-object v0, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->receiver:Landroid/content/BroadcastReceiver;

    if-eqz v0, :cond_0

    :try_start_0
    iget-object v0, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->webView:Lorg/apache/cordova/engine/SystemWebView;

    .line 306
    invoke-virtual {v0}, Lorg/apache/cordova/engine/SystemWebView;->getContext()Landroid/content/Context;

    move-result-object v0

    iget-object v1, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->receiver:Landroid/content/BroadcastReceiver;

    invoke-virtual {v0, v1}, Landroid/content/Context;->unregisterReceiver(Landroid/content/BroadcastReceiver;)V
    :try_end_0
    .catch Ljava/lang/Exception; {:try_start_0 .. :try_end_0} :catch_0

    goto :goto_0

    :catch_0
    move-exception v0

    .line 308
    new-instance v1, Ljava/lang/StringBuilder;

    const-string v2, "Error unregistering configuration receiver: "

    invoke-direct {v1, v2}, Ljava/lang/StringBuilder;-><init>(Ljava/lang/String;)V

    invoke-virtual {v0}, Ljava/lang/Exception;->getMessage()Ljava/lang/String;

    move-result-object v2

    invoke-virtual {v1, v2}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v1}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object v1

    const-string v2, "SystemWebViewEngine"

    invoke-static {v2, v1, v0}, Lorg/apache/cordova/LOG;->e(Ljava/lang/String;Ljava/lang/String;Ljava/lang/Throwable;)V

    :cond_0
    :goto_0
    return-void
.end method

.method public evaluateJavascript(Ljava/lang/String;Landroid/webkit/ValueCallback;)V
    .locals 1
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x0,
            0x0
        }
        names = {
            "js",
            "callback"
        }
    .end annotation

    .annotation system Ldalvik/annotation/Signature;
        value = {
            "(",
            "Ljava/lang/String;",
            "Landroid/webkit/ValueCallback<",
            "Ljava/lang/String;",
            ">;)V"
        }
    .end annotation

    iget-object v0, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->webView:Lorg/apache/cordova/engine/SystemWebView;

    .line 315
    invoke-virtual {v0, p1, p2}, Lorg/apache/cordova/engine/SystemWebView;->evaluateJavascript(Ljava/lang/String;Landroid/webkit/ValueCallback;)V

    return-void
.end method

.method public getCookieManager()Lorg/apache/cordova/ICordovaCookieManager;
    .locals 1

    iget-object v0, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->cookieManager:Lorg/apache/cordova/engine/SystemCookieManager;

    return-object v0
.end method

.method public getCordovaWebView()Lorg/apache/cordova/CordovaWebView;
    .locals 1

    iget-object v0, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->parentWebView:Lorg/apache/cordova/CordovaWebView;

    return-object v0
.end method

.method public getUrl()Ljava/lang/String;
    .locals 1

    iget-object v0, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->webView:Lorg/apache/cordova/engine/SystemWebView;

    .line 249
    invoke-virtual {v0}, Lorg/apache/cordova/engine/SystemWebView;->getUrl()Ljava/lang/String;

    move-result-object v0

    return-object v0
.end method

.method public getView()Landroid/view/View;
    .locals 1

    iget-object v0, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->webView:Lorg/apache/cordova/engine/SystemWebView;

    return-object v0
.end method

.method public goBack()Z
    .locals 1

    iget-object v0, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->webView:Lorg/apache/cordova/engine/SystemWebView;

    .line 281
    invoke-virtual {v0}, Lorg/apache/cordova/engine/SystemWebView;->canGoBack()Z

    move-result v0

    if-eqz v0, :cond_0

    iget-object v0, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->webView:Lorg/apache/cordova/engine/SystemWebView;

    .line 282
    invoke-virtual {v0}, Lorg/apache/cordova/engine/SystemWebView;->goBack()V

    const/4 v0, 0x1

    return v0

    :cond_0
    const/4 v0, 0x0

    return v0
.end method

.method public init(Lorg/apache/cordova/CordovaWebView;Lorg/apache/cordova/CordovaInterface;Lorg/apache/cordova/CordovaWebViewEngine$Client;Lorg/apache/cordova/CordovaResourceApi;Lorg/apache/cordova/PluginManager;Lorg/apache/cordova/NativeToJsMessageQueue;)V
    .locals 1
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x0,
            0x0,
            0x0,
            0x0,
            0x0,
            0x0
        }
        names = {
            "parentWebView",
            "cordova",
            "client",
            "resourceApi",
            "pluginManager",
            "nativeToJsMessageQueue"
        }
    .end annotation

    iget-object v0, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->cordova:Lorg/apache/cordova/CordovaInterface;

    if-nez v0, :cond_1

    iget-object v0, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->preferences:Lorg/apache/cordova/CordovaPreferences;

    if-nez v0, :cond_0

    .line 98
    invoke-interface {p1}, Lorg/apache/cordova/CordovaWebView;->getPreferences()Lorg/apache/cordova/CordovaPreferences;

    move-result-object v0

    iput-object v0, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->preferences:Lorg/apache/cordova/CordovaPreferences;

    :cond_0
    iput-object p1, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->parentWebView:Lorg/apache/cordova/CordovaWebView;

    iput-object p2, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->cordova:Lorg/apache/cordova/CordovaInterface;

    iput-object p3, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->client:Lorg/apache/cordova/CordovaWebViewEngine$Client;

    iput-object p4, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->resourceApi:Lorg/apache/cordova/CordovaResourceApi;

    iput-object p5, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->pluginManager:Lorg/apache/cordova/PluginManager;

    iput-object p6, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->nativeToJsMessageQueue:Lorg/apache/cordova/NativeToJsMessageQueue;

    iget-object p1, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->webView:Lorg/apache/cordova/engine/SystemWebView;

    .line 106
    invoke-virtual {p1, p0, p2}, Lorg/apache/cordova/engine/SystemWebView;->init(Lorg/apache/cordova/engine/SystemWebViewEngine;Lorg/apache/cordova/CordovaInterface;)V

    .line 108
    invoke-direct {p0}, Lorg/apache/cordova/engine/SystemWebViewEngine;->initWebViewSettings()V

    .line 110
    new-instance p1, Lorg/apache/cordova/NativeToJsMessageQueue$OnlineEventsBridgeMode;

    new-instance p3, Lorg/apache/cordova/engine/SystemWebViewEngine$1;

    invoke-direct {p3, p0}, Lorg/apache/cordova/engine/SystemWebViewEngine$1;-><init>(Lorg/apache/cordova/engine/SystemWebViewEngine;)V

    invoke-direct {p1, p3}, Lorg/apache/cordova/NativeToJsMessageQueue$OnlineEventsBridgeMode;-><init>(Lorg/apache/cordova/NativeToJsMessageQueue$OnlineEventsBridgeMode$OnlineEventsBridgeModeDelegate;)V

    invoke-virtual {p6, p1}, Lorg/apache/cordova/NativeToJsMessageQueue;->addBridgeMode(Lorg/apache/cordova/NativeToJsMessageQueue$BridgeMode;)V

    .line 124
    new-instance p1, Lorg/apache/cordova/NativeToJsMessageQueue$EvalBridgeMode;

    invoke-direct {p1, p0, p2}, Lorg/apache/cordova/NativeToJsMessageQueue$EvalBridgeMode;-><init>(Lorg/apache/cordova/CordovaWebViewEngine;Lorg/apache/cordova/CordovaInterface;)V

    invoke-virtual {p6, p1}, Lorg/apache/cordova/NativeToJsMessageQueue;->addBridgeMode(Lorg/apache/cordova/NativeToJsMessageQueue$BridgeMode;)V

    .line 125
    new-instance p1, Lorg/apache/cordova/CordovaBridge;

    invoke-direct {p1, p5, p6}, Lorg/apache/cordova/CordovaBridge;-><init>(Lorg/apache/cordova/PluginManager;Lorg/apache/cordova/NativeToJsMessageQueue;)V

    iput-object p1, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->bridge:Lorg/apache/cordova/CordovaBridge;

    iget-object p2, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->webView:Lorg/apache/cordova/engine/SystemWebView;

    .line 126
    invoke-static {p2, p1}, Lorg/apache/cordova/engine/SystemWebViewEngine;->exposeJsInterface(Landroid/webkit/WebView;Lorg/apache/cordova/CordovaBridge;)V

    return-void

    .line 94
    :cond_1
    new-instance p1, Ljava/lang/IllegalStateException;

    invoke-direct {p1}, Ljava/lang/IllegalStateException;-><init>()V

    throw p1
.end method

.method public loadUrl(Ljava/lang/String;Z)V
    .locals 0
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x10,
            0x0
        }
        names = {
            "url",
            "clearNavigationStack"
        }
    .end annotation

    iget-object p2, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->webView:Lorg/apache/cordova/engine/SystemWebView;

    .line 244
    invoke-virtual {p2, p1}, Lorg/apache/cordova/engine/SystemWebView;->loadUrl(Ljava/lang/String;)V

    return-void
.end method

.method public setPaused(Z)V
    .locals 0
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x0
        }
        names = {
            "value"
        }
    .end annotation

    if-eqz p1, :cond_0

    iget-object p1, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->webView:Lorg/apache/cordova/engine/SystemWebView;

    .line 291
    invoke-virtual {p1}, Lorg/apache/cordova/engine/SystemWebView;->onPause()V

    iget-object p1, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->webView:Lorg/apache/cordova/engine/SystemWebView;

    .line 292
    invoke-virtual {p1}, Lorg/apache/cordova/engine/SystemWebView;->pauseTimers()V

    goto :goto_0

    :cond_0
    iget-object p1, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->webView:Lorg/apache/cordova/engine/SystemWebView;

    .line 294
    invoke-virtual {p1}, Lorg/apache/cordova/engine/SystemWebView;->onResume()V

    iget-object p1, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->webView:Lorg/apache/cordova/engine/SystemWebView;

    .line 295
    invoke-virtual {p1}, Lorg/apache/cordova/engine/SystemWebView;->resumeTimers()V

    :goto_0
    return-void
.end method

.method public stopLoading()V
    .locals 1

    iget-object v0, p0, Lorg/apache/cordova/engine/SystemWebViewEngine;->webView:Lorg/apache/cordova/engine/SystemWebView;

    .line 254
    invoke-virtual {v0}, Lorg/apache/cordova/engine/SystemWebView;->stopLoading()V

    return-void
.end method
