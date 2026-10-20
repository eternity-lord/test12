.class Lcom/capacitorjs/plugins/browser/Browser$1;
.super Landroidx/browser/customtabs/CustomTabsServiceConnection;
.source "Browser.java"


# annotations
.annotation system Ldalvik/annotation/EnclosingClass;
    value = Lcom/capacitorjs/plugins/browser/Browser;
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

    iput-object p1, p0, Lcom/capacitorjs/plugins/browser/Browser$1;->this$0:Lcom/capacitorjs/plugins/browser/Browser;

    .line 47
    invoke-direct {p0}, Landroidx/browser/customtabs/CustomTabsServiceConnection;-><init>()V

    return-void
.end method


# virtual methods
.method public onCustomTabsServiceConnected(Landroid/content/ComponentName;Landroidx/browser/customtabs/CustomTabsClient;)V
    .locals 2

    iget-object p1, p0, Lcom/capacitorjs/plugins/browser/Browser$1;->this$0:Lcom/capacitorjs/plugins/browser/Browser;

    .line 50
    invoke-static {p1, p2}, Lcom/capacitorjs/plugins/browser/Browser;->-$$Nest$fputcustomTabsClient(Lcom/capacitorjs/plugins/browser/Browser;Landroidx/browser/customtabs/CustomTabsClient;)V

    const-wide/16 v0, 0x0

    .line 51
    invoke-virtual {p2, v0, v1}, Landroidx/browser/customtabs/CustomTabsClient;->warmup(J)Z

    return-void
.end method

.method public onServiceDisconnected(Landroid/content/ComponentName;)V
    .locals 0

    return-void
.end method
