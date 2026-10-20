.class public Lcom/capacitorjs/plugins/browser/BrowserPlugin;
.super Lcom/getcapacitor/Plugin;
.source "BrowserPlugin.java"


# annotations
.annotation runtime Lcom/getcapacitor/annotation/CapacitorPlugin;
    name = "Browser"
.end annotation


# static fields
.field private static browserControllerActivityInstance:Lcom/capacitorjs/plugins/browser/BrowserControllerActivity;

.field public static browserControllerListener:Lcom/capacitorjs/plugins/browser/BrowserControllerListener;


# instance fields
.field private implementation:Lcom/capacitorjs/plugins/browser/Browser;


# direct methods
.method public static synthetic $r8$lambda$I9bLDRWh7vl57kOTAfjVKp5lWOU(Lcom/capacitorjs/plugins/browser/BrowserPlugin;Landroid/net/Uri;Ljava/lang/Integer;Lcom/getcapacitor/PluginCall;Lcom/capacitorjs/plugins/browser/BrowserControllerActivity;)V
    .locals 0

    invoke-direct {p0, p1, p2, p3, p4}, Lcom/capacitorjs/plugins/browser/BrowserPlugin;->lambda$open$0(Landroid/net/Uri;Ljava/lang/Integer;Lcom/getcapacitor/PluginCall;Lcom/capacitorjs/plugins/browser/BrowserControllerActivity;)V

    return-void
.end method

.method public constructor <init>()V
    .locals 0

    .line 14
    invoke-direct {p0}, Lcom/getcapacitor/Plugin;-><init>()V

    return-void
.end method

.method private synthetic lambda$open$0(Landroid/net/Uri;Ljava/lang/Integer;Lcom/getcapacitor/PluginCall;Lcom/capacitorjs/plugins/browser/BrowserControllerActivity;)V
    .locals 1

    :try_start_0
    iget-object v0, p0, Lcom/capacitorjs/plugins/browser/BrowserPlugin;->implementation:Lcom/capacitorjs/plugins/browser/Browser;

    .line 73
    invoke-virtual {p4, v0, p1, p2}, Lcom/capacitorjs/plugins/browser/BrowserControllerActivity;->open(Lcom/capacitorjs/plugins/browser/Browser;Landroid/net/Uri;Ljava/lang/Integer;)V

    sput-object p4, Lcom/capacitorjs/plugins/browser/BrowserPlugin;->browserControllerActivityInstance:Lcom/capacitorjs/plugins/browser/BrowserControllerActivity;

    .line 75
    invoke-virtual {p3}, Lcom/getcapacitor/PluginCall;->resolve()V
    :try_end_0
    .catch Landroid/content/ActivityNotFoundException; {:try_start_0 .. :try_end_0} :catch_0

    goto :goto_0

    :catch_0
    move-exception p1

    .line 77
    invoke-virtual {p0}, Lcom/capacitorjs/plugins/browser/BrowserPlugin;->getLogTag()Ljava/lang/String;

    move-result-object p2

    invoke-virtual {p1}, Landroid/content/ActivityNotFoundException;->getLocalizedMessage()Ljava/lang/String;

    move-result-object p1

    const/4 p4, 0x0

    invoke-static {p2, p1, p4}, Lcom/getcapacitor/Logger;->error(Ljava/lang/String;Ljava/lang/String;Ljava/lang/Throwable;)V

    const-string p1, "Unable to display URL"

    .line 78
    invoke-virtual {p3, p1}, Lcom/getcapacitor/PluginCall;->reject(Ljava/lang/String;)V

    :goto_0
    return-void
.end method

.method public static setBrowserControllerListener(Lcom/capacitorjs/plugins/browser/BrowserControllerListener;)V
    .locals 0

    sput-object p0, Lcom/capacitorjs/plugins/browser/BrowserPlugin;->browserControllerListener:Lcom/capacitorjs/plugins/browser/BrowserControllerListener;

    if-nez p0, :cond_0

    const/4 p0, 0x0

    sput-object p0, Lcom/capacitorjs/plugins/browser/BrowserPlugin;->browserControllerActivityInstance:Lcom/capacitorjs/plugins/browser/BrowserControllerActivity;

    :cond_0
    return-void
.end method


# virtual methods
.method public close(Lcom/getcapacitor/PluginCall;)V
    .locals 3
    .annotation runtime Lcom/getcapacitor/PluginMethod;
    .end annotation

    sget-object v0, Lcom/capacitorjs/plugins/browser/BrowserPlugin;->browserControllerActivityInstance:Lcom/capacitorjs/plugins/browser/BrowserControllerActivity;

    if-eqz v0, :cond_0

    const/4 v0, 0x0

    sput-object v0, Lcom/capacitorjs/plugins/browser/BrowserPlugin;->browserControllerActivityInstance:Lcom/capacitorjs/plugins/browser/BrowserControllerActivity;

    .line 88
    new-instance v0, Landroid/content/Intent;

    invoke-virtual {p0}, Lcom/capacitorjs/plugins/browser/BrowserPlugin;->getContext()Landroid/content/Context;

    move-result-object v1

    const-class v2, Lcom/capacitorjs/plugins/browser/BrowserControllerActivity;

    invoke-direct {v0, v1, v2}, Landroid/content/Intent;-><init>(Landroid/content/Context;Ljava/lang/Class;)V

    const-string v1, "close"

    const/4 v2, 0x1

    .line 89
    invoke-virtual {v0, v1, v2}, Landroid/content/Intent;->putExtra(Ljava/lang/String;Z)Landroid/content/Intent;

    .line 90
    invoke-virtual {p0}, Lcom/capacitorjs/plugins/browser/BrowserPlugin;->getContext()Landroid/content/Context;

    move-result-object v1

    invoke-virtual {v1, v0}, Landroid/content/Context;->startActivity(Landroid/content/Intent;)V

    .line 92
    :cond_0
    invoke-virtual {p1}, Lcom/getcapacitor/PluginCall;->resolve()V

    return-void
.end method

.method protected handleOnPause()V
    .locals 1

    iget-object v0, p0, Lcom/capacitorjs/plugins/browser/BrowserPlugin;->implementation:Lcom/capacitorjs/plugins/browser/Browser;

    .line 104
    invoke-virtual {v0}, Lcom/capacitorjs/plugins/browser/Browser;->unbindService()V

    return-void
.end method

.method protected handleOnResume()V
    .locals 3

    iget-object v0, p0, Lcom/capacitorjs/plugins/browser/BrowserPlugin;->implementation:Lcom/capacitorjs/plugins/browser/Browser;

    .line 97
    invoke-virtual {v0}, Lcom/capacitorjs/plugins/browser/Browser;->bindService()Z

    move-result v0

    if-nez v0, :cond_0

    .line 98
    invoke-virtual {p0}, Lcom/capacitorjs/plugins/browser/BrowserPlugin;->getLogTag()Ljava/lang/String;

    move-result-object v0

    const-string v1, "Error binding to custom tabs service"

    const/4 v2, 0x0

    invoke-static {v0, v1, v2}, Lcom/getcapacitor/Logger;->error(Ljava/lang/String;Ljava/lang/String;Ljava/lang/Throwable;)V

    :cond_0
    return-void
.end method

.method public load()V
    .locals 2

    .line 29
    new-instance v0, Lcom/capacitorjs/plugins/browser/Browser;

    invoke-virtual {p0}, Lcom/capacitorjs/plugins/browser/BrowserPlugin;->getContext()Landroid/content/Context;

    move-result-object v1

    invoke-direct {v0, v1}, Lcom/capacitorjs/plugins/browser/Browser;-><init>(Landroid/content/Context;)V

    iput-object v0, p0, Lcom/capacitorjs/plugins/browser/BrowserPlugin;->implementation:Lcom/capacitorjs/plugins/browser/Browser;

    .line 30
    new-instance v1, Lcom/capacitorjs/plugins/browser/BrowserPlugin$$ExternalSyntheticLambda1;

    invoke-direct {v1, p0}, Lcom/capacitorjs/plugins/browser/BrowserPlugin$$ExternalSyntheticLambda1;-><init>(Lcom/capacitorjs/plugins/browser/BrowserPlugin;)V

    invoke-virtual {v0, v1}, Lcom/capacitorjs/plugins/browser/Browser;->setBrowserEventListener(Lcom/capacitorjs/plugins/browser/Browser$BrowserEventListener;)V

    return-void
.end method

.method onBrowserEvent(I)V
    .locals 2

    const/4 v0, 0x1

    const/4 v1, 0x0

    if-eq p1, v0, :cond_1

    const/4 v0, 0x2

    if-eq p1, v0, :cond_0

    goto :goto_0

    :cond_0
    const-string p1, "browserFinished"

    .line 113
    invoke-virtual {p0, p1, v1}, Lcom/capacitorjs/plugins/browser/BrowserPlugin;->notifyListeners(Ljava/lang/String;Lcom/getcapacitor/JSObject;)V

    goto :goto_0

    :cond_1
    const-string p1, "browserPageLoaded"

    .line 110
    invoke-virtual {p0, p1, v1}, Lcom/capacitorjs/plugins/browser/BrowserPlugin;->notifyListeners(Ljava/lang/String;Lcom/getcapacitor/JSObject;)V

    :goto_0
    return-void
.end method

.method public open(Lcom/getcapacitor/PluginCall;)V
    .locals 5
    .annotation runtime Lcom/getcapacitor/PluginMethod;
    .end annotation

    const-string v0, "url"

    .line 36
    invoke-virtual {p1, v0}, Lcom/getcapacitor/PluginCall;->getString(Ljava/lang/String;)Ljava/lang/String;

    move-result-object v0

    if-nez v0, :cond_0

    const-string v0, "Must provide a URL to open"

    .line 38
    invoke-virtual {p1, v0}, Lcom/getcapacitor/PluginCall;->reject(Ljava/lang/String;)V

    return-void

    .line 41
    :cond_0
    invoke-virtual {v0}, Ljava/lang/String;->isEmpty()Z

    move-result v1

    if-eqz v1, :cond_1

    const-string v0, "URL must not be empty"

    .line 42
    invoke-virtual {p1, v0}, Lcom/getcapacitor/PluginCall;->reject(Ljava/lang/String;)V

    return-void

    .line 47
    :cond_1
    :try_start_0
    invoke-static {v0}, Landroid/net/Uri;->parse(Ljava/lang/String;)Landroid/net/Uri;

    move-result-object v0
    :try_end_0
    .catch Ljava/lang/Exception; {:try_start_0 .. :try_end_0} :catch_1

    const-string v1, "toolbarColor"

    .line 54
    invoke-virtual {p1, v1}, Lcom/getcapacitor/PluginCall;->getString(Ljava/lang/String;)Ljava/lang/String;

    move-result-object v1

    const/4 v2, 0x0

    if-eqz v1, :cond_2

    .line 57
    :try_start_1
    invoke-static {v1}, Lcom/getcapacitor/util/WebColor;->parseColor(Ljava/lang/String;)I

    move-result v1

    invoke-static {v1}, Ljava/lang/Integer;->valueOf(I)Ljava/lang/Integer;

    move-result-object v2
    :try_end_1
    .catch Ljava/lang/IllegalArgumentException; {:try_start_1 .. :try_end_1} :catch_0

    goto :goto_0

    .line 59
    :catch_0
    invoke-virtual {p0}, Lcom/capacitorjs/plugins/browser/BrowserPlugin;->getLogTag()Ljava/lang/String;

    move-result-object v1

    const-string v3, "Invalid color provided for toolbarColor. Using default"

    invoke-static {v1, v3, v2}, Lcom/getcapacitor/Logger;->error(Ljava/lang/String;Ljava/lang/String;Ljava/lang/Throwable;)V

    .line 64
    :cond_2
    :goto_0
    new-instance v1, Landroid/content/Intent;

    invoke-virtual {p0}, Lcom/capacitorjs/plugins/browser/BrowserPlugin;->getContext()Landroid/content/Context;

    move-result-object v3

    const-class v4, Lcom/capacitorjs/plugins/browser/BrowserControllerActivity;

    invoke-direct {v1, v3, v4}, Landroid/content/Intent;-><init>(Landroid/content/Context;Ljava/lang/Class;)V

    const/high16 v3, 0x4000000

    .line 65
    invoke-virtual {v1, v3}, Landroid/content/Intent;->addFlags(I)Landroid/content/Intent;

    const/high16 v3, 0x10000000

    .line 66
    invoke-virtual {v1, v3}, Landroid/content/Intent;->addFlags(I)Landroid/content/Intent;

    .line 67
    invoke-virtual {p0}, Lcom/capacitorjs/plugins/browser/BrowserPlugin;->getContext()Landroid/content/Context;

    move-result-object v3

    invoke-virtual {v3, v1}, Landroid/content/Context;->startActivity(Landroid/content/Intent;)V

    .line 70
    new-instance v1, Lcom/capacitorjs/plugins/browser/BrowserPlugin$$ExternalSyntheticLambda0;

    invoke-direct {v1, p0, v0, v2, p1}, Lcom/capacitorjs/plugins/browser/BrowserPlugin$$ExternalSyntheticLambda0;-><init>(Lcom/capacitorjs/plugins/browser/BrowserPlugin;Landroid/net/Uri;Ljava/lang/Integer;Lcom/getcapacitor/PluginCall;)V

    invoke-static {v1}, Lcom/capacitorjs/plugins/browser/BrowserPlugin;->setBrowserControllerListener(Lcom/capacitorjs/plugins/browser/BrowserControllerListener;)V

    return-void

    :catch_1
    move-exception v0

    .line 49
    invoke-virtual {v0}, Ljava/lang/Exception;->getLocalizedMessage()Ljava/lang/String;

    move-result-object v0

    invoke-virtual {p1, v0}, Lcom/getcapacitor/PluginCall;->reject(Ljava/lang/String;)V

    return-void
.end method
