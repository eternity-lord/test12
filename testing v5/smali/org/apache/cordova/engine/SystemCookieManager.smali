.class Lorg/apache/cordova/engine/SystemCookieManager;
.super Ljava/lang/Object;
.source "SystemCookieManager.java"

# interfaces
.implements Lorg/apache/cordova/ICordovaCookieManager;


# instance fields
.field private final cookieManager:Landroid/webkit/CookieManager;

.field protected final webView:Landroid/webkit/WebView;


# direct methods
.method public constructor <init>(Landroid/webkit/WebView;)V
    .locals 2
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x0
        }
        names = {
            "webview"
        }
    .end annotation

    .line 34
    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    iput-object p1, p0, Lorg/apache/cordova/engine/SystemCookieManager;->webView:Landroid/webkit/WebView;

    .line 36
    invoke-static {}, Landroid/webkit/CookieManager;->getInstance()Landroid/webkit/CookieManager;

    move-result-object v0

    iput-object v0, p0, Lorg/apache/cordova/engine/SystemCookieManager;->cookieManager:Landroid/webkit/CookieManager;

    const/4 v1, 0x1

    .line 38
    invoke-static {v1}, Landroid/webkit/CookieManager;->setAcceptFileSchemeCookies(Z)V

    .line 39
    invoke-virtual {v0, p1, v1}, Landroid/webkit/CookieManager;->setAcceptThirdPartyCookies(Landroid/webkit/WebView;Z)V

    return-void
.end method


# virtual methods
.method public clearCookies()V
    .locals 2

    iget-object v0, p0, Lorg/apache/cordova/engine/SystemCookieManager;->cookieManager:Landroid/webkit/CookieManager;

    const/4 v1, 0x0

    .line 56
    invoke-virtual {v0, v1}, Landroid/webkit/CookieManager;->removeAllCookies(Landroid/webkit/ValueCallback;)V

    return-void
.end method

.method public flush()V
    .locals 1

    iget-object v0, p0, Lorg/apache/cordova/engine/SystemCookieManager;->cookieManager:Landroid/webkit/CookieManager;

    .line 60
    invoke-virtual {v0}, Landroid/webkit/CookieManager;->flush()V

    return-void
.end method

.method public getCookie(Ljava/lang/String;)Ljava/lang/String;
    .locals 1
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x10
        }
        names = {
            "url"
        }
    .end annotation

    iget-object v0, p0, Lorg/apache/cordova/engine/SystemCookieManager;->cookieManager:Landroid/webkit/CookieManager;

    .line 51
    invoke-virtual {v0, p1}, Landroid/webkit/CookieManager;->getCookie(Ljava/lang/String;)Ljava/lang/String;

    move-result-object p1

    return-object p1
.end method

.method public setCookie(Ljava/lang/String;Ljava/lang/String;)V
    .locals 1
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x10,
            0x10
        }
        names = {
            "url",
            "value"
        }
    .end annotation

    iget-object v0, p0, Lorg/apache/cordova/engine/SystemCookieManager;->cookieManager:Landroid/webkit/CookieManager;

    .line 47
    invoke-virtual {v0, p1, p2}, Landroid/webkit/CookieManager;->setCookie(Ljava/lang/String;Ljava/lang/String;)V

    return-void
.end method

.method public setCookiesEnabled(Z)V
    .locals 1
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x0
        }
        names = {
            "accept"
        }
    .end annotation

    iget-object v0, p0, Lorg/apache/cordova/engine/SystemCookieManager;->cookieManager:Landroid/webkit/CookieManager;

    .line 43
    invoke-virtual {v0, p1}, Landroid/webkit/CookieManager;->setAcceptCookie(Z)V

    return-void
.end method
