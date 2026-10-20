.class Lorg/apache/cordova/CordovaActivity$4$1;
.super Ljava/lang/Object;
.source "CordovaActivity.java"

# interfaces
.implements Landroid/content/DialogInterface$OnClickListener;


# annotations
.annotation system Ldalvik/annotation/EnclosingMethod;
    value = Lorg/apache/cordova/CordovaActivity$4;->run()V
.end annotation

.annotation system Ldalvik/annotation/InnerClass;
    accessFlags = 0x0
    name = null
.end annotation


# instance fields
.field final synthetic this$1:Lorg/apache/cordova/CordovaActivity$4;


# direct methods
.method constructor <init>(Lorg/apache/cordova/CordovaActivity$4;)V
    .locals 0
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x8010
        }
        names = {
            "this$1"
        }
    .end annotation

    iput-object p1, p0, Lorg/apache/cordova/CordovaActivity$4$1;->this$1:Lorg/apache/cordova/CordovaActivity$4;

    .line 419
    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    return-void
.end method


# virtual methods
.method public onClick(Landroid/content/DialogInterface;I)V
    .locals 0
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x0,
            0x0
        }
        names = {
            "dialog",
            "which"
        }
    .end annotation

    .line 421
    invoke-interface {p1}, Landroid/content/DialogInterface;->dismiss()V

    iget-object p1, p0, Lorg/apache/cordova/CordovaActivity$4$1;->this$1:Lorg/apache/cordova/CordovaActivity$4;

    .line 422
    iget-boolean p1, p1, Lorg/apache/cordova/CordovaActivity$4;->val$exit:Z

    if-eqz p1, :cond_0

    iget-object p1, p0, Lorg/apache/cordova/CordovaActivity$4$1;->this$1:Lorg/apache/cordova/CordovaActivity$4;

    .line 423
    iget-object p1, p1, Lorg/apache/cordova/CordovaActivity$4;->this$0:Lorg/apache/cordova/CordovaActivity;

    invoke-virtual {p1}, Lorg/apache/cordova/CordovaActivity;->finish()V

    :cond_0
    return-void
.end method
