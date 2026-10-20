.class Lcom/getcapacitor/WebViewLocalServer$1;
.super Lcom/getcapacitor/WebViewLocalServer$PathHandler;
.source "WebViewLocalServer.java"


# annotations
.annotation system Ldalvik/annotation/EnclosingMethod;
    value = Lcom/getcapacitor/WebViewLocalServer;->createHostingDetails()V
.end annotation

.annotation system Ldalvik/annotation/InnerClass;
    accessFlags = 0x0
    name = null
.end annotation


# instance fields
.field final synthetic this$0:Lcom/getcapacitor/WebViewLocalServer;

.field final synthetic val$assetPath:Ljava/lang/String;


# direct methods
.method constructor <init>(Lcom/getcapacitor/WebViewLocalServer;Ljava/lang/String;)V
    .locals 0
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x8010,
            0x1010
        }
        names = {
            null,
            null
        }
    .end annotation

    iput-object p1, p0, Lcom/getcapacitor/WebViewLocalServer$1;->this$0:Lcom/getcapacitor/WebViewLocalServer;

    iput-object p2, p0, Lcom/getcapacitor/WebViewLocalServer$1;->val$assetPath:Ljava/lang/String;

    .line 613
    invoke-direct {p0}, Lcom/getcapacitor/WebViewLocalServer$PathHandler;-><init>()V

    return-void
.end method


# virtual methods
.method public handle(Landroid/net/Uri;)Ljava/io/InputStream;
    .locals 6

    .line 617
    invoke-virtual {p1}, Landroid/net/Uri;->getPath()Ljava/lang/String;

    move-result-object v0

    iget-object v1, p0, Lcom/getcapacitor/WebViewLocalServer$1;->this$0:Lcom/getcapacitor/WebViewLocalServer;

    .line 620
    invoke-static {v1}, Lcom/getcapacitor/WebViewLocalServer;->-$$Nest$fgetbridge(Lcom/getcapacitor/WebViewLocalServer;)Lcom/getcapacitor/Bridge;

    move-result-object v1

    invoke-virtual {v1}, Lcom/getcapacitor/Bridge;->getRouteProcessor()Lcom/getcapacitor/RouteProcessor;

    move-result-object v1

    if-eqz v1, :cond_0

    iget-object v2, p0, Lcom/getcapacitor/WebViewLocalServer$1;->this$0:Lcom/getcapacitor/WebViewLocalServer;

    .line 623
    invoke-static {v2}, Lcom/getcapacitor/WebViewLocalServer;->-$$Nest$fgetbridge(Lcom/getcapacitor/WebViewLocalServer;)Lcom/getcapacitor/Bridge;

    move-result-object v2

    invoke-virtual {v2}, Lcom/getcapacitor/Bridge;->getRouteProcessor()Lcom/getcapacitor/RouteProcessor;

    move-result-object v2

    const-string v3, ""

    invoke-interface {v2, v3, v0}, Lcom/getcapacitor/RouteProcessor;->process(Ljava/lang/String;Ljava/lang/String;)Lcom/getcapacitor/ProcessedRoute;

    move-result-object v0

    .line 624
    invoke-virtual {v0}, Lcom/getcapacitor/ProcessedRoute;->getPath()Ljava/lang/String;

    move-result-object v2

    iget-object v3, p0, Lcom/getcapacitor/WebViewLocalServer$1;->this$0:Lcom/getcapacitor/WebViewLocalServer;

    .line 625
    invoke-virtual {v0}, Lcom/getcapacitor/ProcessedRoute;->isAsset()Z

    move-result v4

    invoke-static {v3, v4}, Lcom/getcapacitor/WebViewLocalServer;->-$$Nest$fputisAsset(Lcom/getcapacitor/WebViewLocalServer;Z)V

    .line 626
    invoke-virtual {v0}, Lcom/getcapacitor/ProcessedRoute;->isIgnoreAssetPath()Z

    move-result v0

    move-object v5, v2

    move v2, v0

    move-object v0, v5

    goto :goto_0

    :cond_0
    const/4 v2, 0x0

    :goto_0
    :try_start_0
    const-string v3, "/_capacitor_content_"

    .line 630
    invoke-virtual {v0, v3}, Ljava/lang/String;->startsWith(Ljava/lang/String;)Z

    move-result v3

    if-eqz v3, :cond_1

    iget-object v0, p0, Lcom/getcapacitor/WebViewLocalServer$1;->this$0:Lcom/getcapacitor/WebViewLocalServer;

    .line 631
    invoke-static {v0}, Lcom/getcapacitor/WebViewLocalServer;->-$$Nest$fgetprotocolHandler(Lcom/getcapacitor/WebViewLocalServer;)Lcom/getcapacitor/AndroidProtocolHandler;

    move-result-object v0

    invoke-virtual {v0, p1}, Lcom/getcapacitor/AndroidProtocolHandler;->openContentUrl(Landroid/net/Uri;)Ljava/io/InputStream;

    move-result-object p1

    goto :goto_1

    :cond_1
    const-string v3, "/_capacitor_file_"

    .line 632
    invoke-virtual {v0, v3}, Ljava/lang/String;->startsWith(Ljava/lang/String;)Z

    move-result v3

    if-eqz v3, :cond_2

    iget-object v1, p0, Lcom/getcapacitor/WebViewLocalServer$1;->this$0:Lcom/getcapacitor/WebViewLocalServer;

    .line 633
    invoke-static {v1}, Lcom/getcapacitor/WebViewLocalServer;->-$$Nest$fgetprotocolHandler(Lcom/getcapacitor/WebViewLocalServer;)Lcom/getcapacitor/AndroidProtocolHandler;

    move-result-object v1

    invoke-virtual {v1, v0}, Lcom/getcapacitor/AndroidProtocolHandler;->openFile(Ljava/lang/String;)Ljava/io/InputStream;

    move-result-object p1

    goto :goto_1

    :cond_2
    iget-object v3, p0, Lcom/getcapacitor/WebViewLocalServer$1;->this$0:Lcom/getcapacitor/WebViewLocalServer;

    .line 634
    invoke-static {v3}, Lcom/getcapacitor/WebViewLocalServer;->-$$Nest$fgetisAsset(Lcom/getcapacitor/WebViewLocalServer;)Z

    move-result v3

    if-nez v3, :cond_4

    if-nez v1, :cond_3

    .line 636
    new-instance v0, Ljava/lang/StringBuilder;

    invoke-direct {v0}, Ljava/lang/StringBuilder;-><init>()V

    iget-object v1, p0, Lcom/getcapacitor/WebViewLocalServer$1;->this$0:Lcom/getcapacitor/WebViewLocalServer;

    invoke-static {v1}, Lcom/getcapacitor/WebViewLocalServer;->-$$Nest$fgetbasePath(Lcom/getcapacitor/WebViewLocalServer;)Ljava/lang/String;

    move-result-object v1

    invoke-virtual {v0, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {p1}, Landroid/net/Uri;->getPath()Ljava/lang/String;

    move-result-object v1

    invoke-virtual {v0, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v0}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object v0

    :cond_3
    iget-object v1, p0, Lcom/getcapacitor/WebViewLocalServer$1;->this$0:Lcom/getcapacitor/WebViewLocalServer;

    .line 639
    invoke-static {v1}, Lcom/getcapacitor/WebViewLocalServer;->-$$Nest$fgetprotocolHandler(Lcom/getcapacitor/WebViewLocalServer;)Lcom/getcapacitor/AndroidProtocolHandler;

    move-result-object v1

    invoke-virtual {v1, v0}, Lcom/getcapacitor/AndroidProtocolHandler;->openFile(Ljava/lang/String;)Ljava/io/InputStream;

    move-result-object p1

    goto :goto_1

    :cond_4
    if-eqz v2, :cond_5

    iget-object v1, p0, Lcom/getcapacitor/WebViewLocalServer$1;->this$0:Lcom/getcapacitor/WebViewLocalServer;

    .line 641
    invoke-static {v1}, Lcom/getcapacitor/WebViewLocalServer;->-$$Nest$fgetprotocolHandler(Lcom/getcapacitor/WebViewLocalServer;)Lcom/getcapacitor/AndroidProtocolHandler;

    move-result-object v1

    invoke-virtual {v1, v0}, Lcom/getcapacitor/AndroidProtocolHandler;->openAsset(Ljava/lang/String;)Ljava/io/InputStream;

    move-result-object p1

    goto :goto_1

    :cond_5
    iget-object v1, p0, Lcom/getcapacitor/WebViewLocalServer$1;->this$0:Lcom/getcapacitor/WebViewLocalServer;

    .line 643
    invoke-static {v1}, Lcom/getcapacitor/WebViewLocalServer;->-$$Nest$fgetprotocolHandler(Lcom/getcapacitor/WebViewLocalServer;)Lcom/getcapacitor/AndroidProtocolHandler;

    move-result-object v1

    new-instance v2, Ljava/lang/StringBuilder;

    invoke-direct {v2}, Ljava/lang/StringBuilder;-><init>()V

    iget-object v3, p0, Lcom/getcapacitor/WebViewLocalServer$1;->val$assetPath:Ljava/lang/String;

    invoke-virtual {v2, v3}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v2, v0}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v2}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object v0

    invoke-virtual {v1, v0}, Lcom/getcapacitor/AndroidProtocolHandler;->openAsset(Ljava/lang/String;)Ljava/io/InputStream;

    move-result-object p1
    :try_end_0
    .catch Ljava/io/IOException; {:try_start_0 .. :try_end_0} :catch_0

    :goto_1
    return-object p1

    .line 646
    :catch_0
    new-instance v0, Ljava/lang/StringBuilder;

    const-string v1, "Unable to open asset URL: "

    invoke-direct {v0, v1}, Ljava/lang/StringBuilder;-><init>(Ljava/lang/String;)V

    invoke-virtual {v0, p1}, Ljava/lang/StringBuilder;->append(Ljava/lang/Object;)Ljava/lang/StringBuilder;

    invoke-virtual {v0}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object p1

    invoke-static {p1}, Lcom/getcapacitor/Logger;->error(Ljava/lang/String;)V

    const/4 p1, 0x0

    return-object p1
.end method
