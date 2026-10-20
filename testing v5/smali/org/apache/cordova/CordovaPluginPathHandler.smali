.class public Lorg/apache/cordova/CordovaPluginPathHandler;
.super Ljava/lang/Object;
.source "CordovaPluginPathHandler.java"


# instance fields
.field private final handler:Landroidx/webkit/WebViewAssetLoader$PathHandler;


# direct methods
.method public constructor <init>(Landroidx/webkit/WebViewAssetLoader$PathHandler;)V
    .locals 0
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x0
        }
        names = {
            "handler"
        }
    .end annotation

    .line 31
    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    iput-object p1, p0, Lorg/apache/cordova/CordovaPluginPathHandler;->handler:Landroidx/webkit/WebViewAssetLoader$PathHandler;

    return-void
.end method


# virtual methods
.method public getPathHandler()Landroidx/webkit/WebViewAssetLoader$PathHandler;
    .locals 1

    iget-object v0, p0, Lorg/apache/cordova/CordovaPluginPathHandler;->handler:Landroidx/webkit/WebViewAssetLoader$PathHandler;

    return-object v0
.end method
