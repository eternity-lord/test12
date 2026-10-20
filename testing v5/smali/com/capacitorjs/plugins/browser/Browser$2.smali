.class Lcom/capacitorjs/plugins/browser/Browser$2;
.super Landroidx/browser/customtabs/CustomTabsCallback;
.source "Browser.java"


# annotations
.annotation system Ldalvik/annotation/EnclosingMethod;
    value = Lcom/capacitorjs/plugins/browser/Browser;->getCustomTabsSession()Landroidx/browser/customtabs/CustomTabsSession;
.end annotation

.annotation system Ldalvik/annotation/InnerClass;
    accessFlags = 0x0
    name = null
.end annotation


# instance fields
.field final synthetic this$0:Lcom/capacitorjs/plugins/browser/Browser;


# direct methods
.method constructor <init>(Lcom/capacitorjs/plugins/browser/Browser;)V
    .locals 0
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x8010
        }
        names = {
            null
        }
    .end annotation

    iput-object p1, p0, Lcom/capacitorjs/plugins/browser/Browser$2;->this$0:Lcom/capacitorjs/plugins/browser/Browser;

    .line 173
    invoke-direct {p0}, Landroidx/browser/customtabs/CustomTabsCallback;-><init>()V

    return-void
.end method


# virtual methods
.method public onNavigationEvent(ILandroid/os/Bundle;)V
    .locals 0

    iget-object p2, p0, Lcom/capacitorjs/plugins/browser/Browser$2;->this$0:Lcom/capacitorjs/plugins/browser/Browser;

    .line 176
    invoke-static {p2, p1}, Lcom/capacitorjs/plugins/browser/Browser;->-$$Nest$mhandledNavigationEvent(Lcom/capacitorjs/plugins/browser/Browser;I)V

    return-void
.end method
