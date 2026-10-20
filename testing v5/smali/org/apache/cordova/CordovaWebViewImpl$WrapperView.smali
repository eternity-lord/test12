.class Lorg/apache/cordova/CordovaWebViewImpl$WrapperView;
.super Landroid/widget/FrameLayout;
.source "CordovaWebViewImpl.java"


# annotations
.annotation system Ldalvik/annotation/EnclosingClass;
    value = Lorg/apache/cordova/CordovaWebViewImpl;
.end annotation

.annotation system Ldalvik/annotation/InnerClass;
    accessFlags = 0xa
    name = "WrapperView"
.end annotation


# instance fields
.field private final engine:Lorg/apache/cordova/CordovaWebViewEngine;


# direct methods
.method public constructor <init>(Landroid/content/Context;Lorg/apache/cordova/CordovaWebViewEngine;)V
    .locals 0
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x0,
            0x0
        }
        names = {
            "context",
            "engine"
        }
    .end annotation

    .line 275
    invoke-direct {p0, p1}, Landroid/widget/FrameLayout;-><init>(Landroid/content/Context;)V

    iput-object p2, p0, Lorg/apache/cordova/CordovaWebViewImpl$WrapperView;->engine:Lorg/apache/cordova/CordovaWebViewEngine;

    return-void
.end method


# virtual methods
.method public dispatchKeyEvent(Landroid/view/KeyEvent;)Z
    .locals 1
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x0
        }
        names = {
            "event"
        }
    .end annotation

    iget-object v0, p0, Lorg/apache/cordova/CordovaWebViewImpl$WrapperView;->engine:Lorg/apache/cordova/CordovaWebViewEngine;

    .line 281
    invoke-interface {v0}, Lorg/apache/cordova/CordovaWebViewEngine;->getView()Landroid/view/View;

    move-result-object v0

    invoke-virtual {v0, p1}, Landroid/view/View;->dispatchKeyEvent(Landroid/view/KeyEvent;)Z

    move-result v0

    if-nez v0, :cond_0

    .line 284
    invoke-super {p0, p1}, Landroid/widget/FrameLayout;->dispatchKeyEvent(Landroid/view/KeyEvent;)Z

    move-result v0

    :cond_0
    return v0
.end method
