.class public final synthetic Lcom/capacitorjs/plugins/browser/BrowserPlugin$$ExternalSyntheticLambda1;
.super Ljava/lang/Object;
.source "D8$$SyntheticClass"

# interfaces
.implements Lcom/capacitorjs/plugins/browser/Browser$BrowserEventListener;


# instance fields
.field public final synthetic f$0:Lcom/capacitorjs/plugins/browser/BrowserPlugin;


# direct methods
.method public synthetic constructor <init>(Lcom/capacitorjs/plugins/browser/BrowserPlugin;)V
    .locals 0

    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    iput-object p1, p0, Lcom/capacitorjs/plugins/browser/BrowserPlugin$$ExternalSyntheticLambda1;->f$0:Lcom/capacitorjs/plugins/browser/BrowserPlugin;

    return-void
.end method


# virtual methods
.method public final onBrowserEvent(I)V
    .locals 1

    iget-object v0, p0, Lcom/capacitorjs/plugins/browser/BrowserPlugin$$ExternalSyntheticLambda1;->f$0:Lcom/capacitorjs/plugins/browser/BrowserPlugin;

    invoke-virtual {v0, p1}, Lcom/capacitorjs/plugins/browser/BrowserPlugin;->onBrowserEvent(I)V

    return-void
.end method
