.class public interface abstract Lorg/apache/cordova/ICordovaClientCertRequest;
.super Ljava/lang/Object;
.source "ICordovaClientCertRequest.java"


# virtual methods
.method public abstract cancel()V
.end method

.method public abstract getHost()Ljava/lang/String;
.end method

.method public abstract getKeyTypes()[Ljava/lang/String;
.end method

.method public abstract getPort()I
.end method

.method public abstract getPrincipals()[Ljava/security/Principal;
.end method

.method public abstract ignore()V
.end method

.method public abstract proceed(Ljava/security/PrivateKey;[Ljava/security/cert/X509Certificate;)V
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x0,
            0x0
        }
        names = {
            "privateKey",
            "chain"
        }
    .end annotation
.end method
