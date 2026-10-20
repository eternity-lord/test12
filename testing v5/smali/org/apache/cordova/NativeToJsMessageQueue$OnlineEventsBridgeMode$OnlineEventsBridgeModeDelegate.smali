.class public interface abstract Lorg/apache/cordova/NativeToJsMessageQueue$OnlineEventsBridgeMode$OnlineEventsBridgeModeDelegate;
.super Ljava/lang/Object;
.source "NativeToJsMessageQueue.java"


# annotations
.annotation system Ldalvik/annotation/EnclosingClass;
    value = Lorg/apache/cordova/NativeToJsMessageQueue$OnlineEventsBridgeMode;
.end annotation

.annotation system Ldalvik/annotation/InnerClass;
    accessFlags = 0x609
    name = "OnlineEventsBridgeModeDelegate"
.end annotation


# virtual methods
.method public abstract runOnUiThread(Ljava/lang/Runnable;)V
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x0
        }
        names = {
            "r"
        }
    .end annotation
.end method

.method public abstract setNetworkAvailable(Z)V
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x0
        }
        names = {
            "value"
        }
    .end annotation
.end method
