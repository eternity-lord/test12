.class public interface abstract Lorg/apache/cordova/ICordovaCookieManager;
.super Ljava/lang/Object;
.source "ICordovaCookieManager.java"


# virtual methods
.method public abstract clearCookies()V
.end method

.method public abstract flush()V
.end method

.method public abstract getCookie(Ljava/lang/String;)Ljava/lang/String;
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x10
        }
        names = {
            "url"
        }
    .end annotation
.end method

.method public abstract setCookie(Ljava/lang/String;Ljava/lang/String;)V
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
.end method

.method public abstract setCookiesEnabled(Z)V
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x0
        }
        names = {
            "accept"
        }
    .end annotation
.end method
