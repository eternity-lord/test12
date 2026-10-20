.class public interface abstract Lorg/apache/cordova/CordovaInterface;
.super Ljava/lang/Object;
.source "CordovaInterface.java"


# virtual methods
.method public abstract getActivity()Landroidx/appcompat/app/AppCompatActivity;
.end method

.method public abstract getContext()Landroid/content/Context;
.end method

.method public abstract getThreadPool()Ljava/util/concurrent/ExecutorService;
.end method

.method public abstract hasPermission(Ljava/lang/String;)Z
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x0
        }
        names = {
            "permission"
        }
    .end annotation
.end method

.method public abstract onMessage(Ljava/lang/String;Ljava/lang/Object;)Ljava/lang/Object;
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

.method public abstract requestPermission(Lorg/apache/cordova/CordovaPlugin;ILjava/lang/String;)V
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x0,
            0x0,
            0x0
        }
        names = {
            "plugin",
            "requestCode",
            "permission"
        }
    .end annotation
.end method

.method public abstract requestPermissions(Lorg/apache/cordova/CordovaPlugin;I[Ljava/lang/String;)V
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x0,
            0x0,
            0x0
        }
        names = {
            "plugin",
            "requestCode",
            "permissions"
        }
    .end annotation
.end method

.method public abstract setActivityResultCallback(Lorg/apache/cordova/CordovaPlugin;)V
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x0
        }
        names = {
            "plugin"
        }
    .end annotation
.end method

.method public abstract startActivityForResult(Lorg/apache/cordova/CordovaPlugin;Landroid/content/Intent;I)V
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x0,
            0x0,
            0x0
        }
        names = {
            "command",
            "intent",
            "requestCode"
        }
    .end annotation
.end method
