.class public final synthetic Lcom/capacitorjs/plugins/browser/BrowserPlugin$$ExternalSyntheticLambda0;
.super Ljava/lang/Object;
.source "D8$$SyntheticClass"

# interfaces
.implements Lcom/capacitorjs/plugins/browser/BrowserControllerListener;


# instance fields
.field public final synthetic f$0:Lcom/capacitorjs/plugins/browser/BrowserPlugin;

.field public final synthetic f$1:Landroid/net/Uri;

.field public final synthetic f$2:Ljava/lang/Integer;

.field public final synthetic f$3:Lcom/getcapacitor/PluginCall;


# direct methods
.method public synthetic constructor <init>(Lcom/capacitorjs/plugins/browser/BrowserPlugin;Landroid/net/Uri;Ljava/lang/Integer;Lcom/getcapacitor/PluginCall;)V
    .locals 0

    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    iput-object p1, p0, Lcom/capacitorjs/plugins/browser/BrowserPlugin$$ExternalSyntheticLambda0;->f$0:Lcom/capacitorjs/plugins/browser/BrowserPlugin;

    iput-object p2, p0, Lcom/capacitorjs/plugins/browser/BrowserPlugin$$ExternalSyntheticLambda0;->f$1:Landroid/net/Uri;

    iput-object p3, p0, Lcom/capacitorjs/plugins/browser/BrowserPlugin$$ExternalSyntheticLambda0;->f$2:Ljava/lang/Integer;

    iput-object p4, p0, Lcom/capacitorjs/plugins/browser/BrowserPlugin$$ExternalSyntheticLambda0;->f$3:Lcom/getcapacitor/PluginCall;

    return-void
.end method


# virtual methods
.method public final onControllerReady(Lcom/capacitorjs/plugins/browser/BrowserControllerActivity;)V
    .locals 4

    iget-object v0, p0, Lcom/capacitorjs/plugins/browser/BrowserPlugin$$ExternalSyntheticLambda0;->f$0:Lcom/capacitorjs/plugins/browser/BrowserPlugin;

    iget-object v1, p0, Lcom/capacitorjs/plugins/browser/BrowserPlugin$$ExternalSyntheticLambda0;->f$1:Landroid/net/Uri;

    iget-object v2, p0, Lcom/capacitorjs/plugins/browser/BrowserPlugin$$ExternalSyntheticLambda0;->f$2:Ljava/lang/Integer;

    iget-object v3, p0, Lcom/capacitorjs/plugins/browser/BrowserPlugin$$ExternalSyntheticLambda0;->f$3:Lcom/getcapacitor/PluginCall;

    invoke-static {v0, v1, v2, v3, p1}, Lcom/capacitorjs/plugins/browser/BrowserPlugin;->$r8$lambda$I9bLDRWh7vl57kOTAfjVKp5lWOU(Lcom/capacitorjs/plugins/browser/BrowserPlugin;Landroid/net/Uri;Ljava/lang/Integer;Lcom/getcapacitor/PluginCall;Lcom/capacitorjs/plugins/browser/BrowserControllerActivity;)V

    return-void
.end method
