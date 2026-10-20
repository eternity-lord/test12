.class public Lcom/capacitorjs/plugins/browser/BrowserControllerActivity;
.super Landroid/app/Activity;
.source "BrowserControllerActivity.java"


# instance fields
.field private isCustomTabsOpen:Z


# direct methods
.method public constructor <init>()V
    .locals 1

    .line 9
    invoke-direct {p0}, Landroid/app/Activity;-><init>()V

    const/4 v0, 0x0

    iput-boolean v0, p0, Lcom/capacitorjs/plugins/browser/BrowserControllerActivity;->isCustomTabsOpen:Z

    return-void
.end method


# virtual methods
.method protected onCreate(Landroid/os/Bundle;)V
    .locals 0

    .line 15
    invoke-super {p0, p1}, Landroid/app/Activity;->onCreate(Landroid/os/Bundle;)V

    const/4 p1, 0x0

    iput-boolean p1, p0, Lcom/capacitorjs/plugins/browser/BrowserControllerActivity;->isCustomTabsOpen:Z

    .line 18
    sget-object p1, Lcom/capacitorjs/plugins/browser/BrowserPlugin;->browserControllerListener:Lcom/capacitorjs/plugins/browser/BrowserControllerListener;

    if-eqz p1, :cond_0

    .line 19
    sget-object p1, Lcom/capacitorjs/plugins/browser/BrowserPlugin;->browserControllerListener:Lcom/capacitorjs/plugins/browser/BrowserControllerListener;

    invoke-interface {p1, p0}, Lcom/capacitorjs/plugins/browser/BrowserControllerListener;->onControllerReady(Lcom/capacitorjs/plugins/browser/BrowserControllerActivity;)V

    :cond_0
    return-void
.end method

.method protected onDestroy()V
    .locals 1

    .line 48
    invoke-super {p0}, Landroid/app/Activity;->onDestroy()V

    const/4 v0, 0x0

    iput-boolean v0, p0, Lcom/capacitorjs/plugins/browser/BrowserControllerActivity;->isCustomTabsOpen:Z

    const/4 v0, 0x0

    .line 50
    invoke-static {v0}, Lcom/capacitorjs/plugins/browser/BrowserPlugin;->setBrowserControllerListener(Lcom/capacitorjs/plugins/browser/BrowserControllerListener;)V

    return-void
.end method

.method protected onNewIntent(Landroid/content/Intent;)V
    .locals 1

    .line 25
    invoke-super {p0, p1}, Landroid/app/Activity;->onNewIntent(Landroid/content/Intent;)V

    const-string v0, "close"

    .line 26
    invoke-virtual {p1, v0}, Landroid/content/Intent;->hasExtra(Ljava/lang/String;)Z

    move-result p1

    if-eqz p1, :cond_0

    .line 27
    invoke-virtual {p0}, Lcom/capacitorjs/plugins/browser/BrowserControllerActivity;->finish()V

    :cond_0
    return-void
.end method

.method protected onResume()V
    .locals 1

    .line 33
    invoke-super {p0}, Landroid/app/Activity;->onResume()V

    iget-boolean v0, p0, Lcom/capacitorjs/plugins/browser/BrowserControllerActivity;->isCustomTabsOpen:Z

    if-eqz v0, :cond_0

    const/4 v0, 0x0

    iput-boolean v0, p0, Lcom/capacitorjs/plugins/browser/BrowserControllerActivity;->isCustomTabsOpen:Z

    .line 36
    invoke-virtual {p0}, Lcom/capacitorjs/plugins/browser/BrowserControllerActivity;->finish()V

    goto :goto_0

    :cond_0
    const/4 v0, 0x1

    iput-boolean v0, p0, Lcom/capacitorjs/plugins/browser/BrowserControllerActivity;->isCustomTabsOpen:Z

    :goto_0
    return-void
.end method

.method public open(Lcom/capacitorjs/plugins/browser/Browser;Landroid/net/Uri;Ljava/lang/Integer;)V
    .locals 0

    .line 43
    invoke-virtual {p1, p2, p3}, Lcom/capacitorjs/plugins/browser/Browser;->open(Landroid/net/Uri;Ljava/lang/Integer;)V

    return-void
.end method
