.class public Lcom/getcapacitor/WebViewLocalServer;
.super Ljava/lang/Object;
.source "WebViewLocalServer.java"


# annotations
.annotation system Ldalvik/annotation/MemberClasses;
    value = {
        Lcom/getcapacitor/WebViewLocalServer$PathHandler;,
        Lcom/getcapacitor/WebViewLocalServer$LollipopLazyInputStream;,
        Lcom/getcapacitor/WebViewLocalServer$LazyInputStream;
    }
.end annotation


# static fields
.field private static final capacitorContentStart:Ljava/lang/String; = "/_capacitor_content_"

.field private static final capacitorFileStart:Ljava/lang/String; = "/_capacitor_file_"


# instance fields
.field private final authorities:Ljava/util/ArrayList;
    .annotation system Ldalvik/annotation/Signature;
        value = {
            "Ljava/util/ArrayList<",
            "Ljava/lang/String;",
            ">;"
        }
    .end annotation
.end field

.field private basePath:Ljava/lang/String;

.field private final bridge:Lcom/getcapacitor/Bridge;

.field private final html5mode:Z

.field private isAsset:Z

.field private final jsInjector:Lcom/getcapacitor/JSInjector;

.field private final protocolHandler:Lcom/getcapacitor/AndroidProtocolHandler;

.field private final uriMatcher:Lcom/getcapacitor/UriMatcher;


# direct methods
.method static bridge synthetic -$$Nest$fgetbasePath(Lcom/getcapacitor/WebViewLocalServer;)Ljava/lang/String;
    .locals 0

    iget-object p0, p0, Lcom/getcapacitor/WebViewLocalServer;->basePath:Ljava/lang/String;

    return-object p0
.end method

.method static bridge synthetic -$$Nest$fgetbridge(Lcom/getcapacitor/WebViewLocalServer;)Lcom/getcapacitor/Bridge;
    .locals 0

    iget-object p0, p0, Lcom/getcapacitor/WebViewLocalServer;->bridge:Lcom/getcapacitor/Bridge;

    return-object p0
.end method

.method static bridge synthetic -$$Nest$fgetisAsset(Lcom/getcapacitor/WebViewLocalServer;)Z
    .locals 0

    iget-boolean p0, p0, Lcom/getcapacitor/WebViewLocalServer;->isAsset:Z

    return p0
.end method

.method static bridge synthetic -$$Nest$fgetprotocolHandler(Lcom/getcapacitor/WebViewLocalServer;)Lcom/getcapacitor/AndroidProtocolHandler;
    .locals 0

    iget-object p0, p0, Lcom/getcapacitor/WebViewLocalServer;->protocolHandler:Lcom/getcapacitor/AndroidProtocolHandler;

    return-object p0
.end method

.method static bridge synthetic -$$Nest$fputisAsset(Lcom/getcapacitor/WebViewLocalServer;Z)V
    .locals 0

    iput-boolean p1, p0, Lcom/getcapacitor/WebViewLocalServer;->isAsset:Z

    return-void
.end method

.method constructor <init>(Landroid/content/Context;Lcom/getcapacitor/Bridge;Lcom/getcapacitor/JSInjector;Ljava/util/ArrayList;Z)V
    .locals 2
    .annotation system Ldalvik/annotation/Signature;
        value = {
            "(",
            "Landroid/content/Context;",
            "Lcom/getcapacitor/Bridge;",
            "Lcom/getcapacitor/JSInjector;",
            "Ljava/util/ArrayList<",
            "Ljava/lang/String;",
            ">;Z)V"
        }
    .end annotation

    .line 136
    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    .line 137
    new-instance v0, Lcom/getcapacitor/UriMatcher;

    const/4 v1, 0x0

    invoke-direct {v0, v1}, Lcom/getcapacitor/UriMatcher;-><init>(Ljava/lang/Object;)V

    iput-object v0, p0, Lcom/getcapacitor/WebViewLocalServer;->uriMatcher:Lcom/getcapacitor/UriMatcher;

    iput-boolean p5, p0, Lcom/getcapacitor/WebViewLocalServer;->html5mode:Z

    .line 139
    new-instance p5, Lcom/getcapacitor/AndroidProtocolHandler;

    invoke-virtual {p1}, Landroid/content/Context;->getApplicationContext()Landroid/content/Context;

    move-result-object p1

    invoke-direct {p5, p1}, Lcom/getcapacitor/AndroidProtocolHandler;-><init>(Landroid/content/Context;)V

    iput-object p5, p0, Lcom/getcapacitor/WebViewLocalServer;->protocolHandler:Lcom/getcapacitor/AndroidProtocolHandler;

    iput-object p4, p0, Lcom/getcapacitor/WebViewLocalServer;->authorities:Ljava/util/ArrayList;

    iput-object p2, p0, Lcom/getcapacitor/WebViewLocalServer;->bridge:Lcom/getcapacitor/Bridge;

    iput-object p3, p0, Lcom/getcapacitor/WebViewLocalServer;->jsInjector:Lcom/getcapacitor/JSInjector;

    return-void
.end method

.method private createHostingDetails()V
    .locals 6

    iget-object v0, p0, Lcom/getcapacitor/WebViewLocalServer;->basePath:Ljava/lang/String;

    const/16 v1, 0x2a

    .line 609
    invoke-virtual {v0, v1}, Ljava/lang/String;->indexOf(I)I

    move-result v1

    const/4 v2, -0x1

    if-ne v1, v2, :cond_2

    .line 613
    new-instance v1, Lcom/getcapacitor/WebViewLocalServer$1;

    invoke-direct {v1, p0, v0}, Lcom/getcapacitor/WebViewLocalServer$1;-><init>(Lcom/getcapacitor/WebViewLocalServer;Ljava/lang/String;)V

    iget-object v0, p0, Lcom/getcapacitor/WebViewLocalServer;->authorities:Ljava/util/ArrayList;

    .line 654
    invoke-virtual {v0}, Ljava/util/ArrayList;->iterator()Ljava/util/Iterator;

    move-result-object v0

    :cond_0
    :goto_0
    invoke-interface {v0}, Ljava/util/Iterator;->hasNext()Z

    move-result v2

    if-eqz v2, :cond_1

    invoke-interface {v0}, Ljava/util/Iterator;->next()Ljava/lang/Object;

    move-result-object v2

    check-cast v2, Ljava/lang/String;

    const-string v3, "http"

    .line 655
    invoke-direct {p0, v3, v1, v2}, Lcom/getcapacitor/WebViewLocalServer;->registerUriForScheme(Ljava/lang/String;Lcom/getcapacitor/WebViewLocalServer$PathHandler;Ljava/lang/String;)V

    const-string v4, "https"

    .line 656
    invoke-direct {p0, v4, v1, v2}, Lcom/getcapacitor/WebViewLocalServer;->registerUriForScheme(Ljava/lang/String;Lcom/getcapacitor/WebViewLocalServer$PathHandler;Ljava/lang/String;)V

    iget-object v5, p0, Lcom/getcapacitor/WebViewLocalServer;->bridge:Lcom/getcapacitor/Bridge;

    .line 658
    invoke-virtual {v5}, Lcom/getcapacitor/Bridge;->getScheme()Ljava/lang/String;

    move-result-object v5

    .line 659
    invoke-virtual {v5, v3}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v3

    if-nez v3, :cond_0

    invoke-virtual {v5, v4}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v3

    if-nez v3, :cond_0

    .line 660
    invoke-direct {p0, v5, v1, v2}, Lcom/getcapacitor/WebViewLocalServer;->registerUriForScheme(Ljava/lang/String;Lcom/getcapacitor/WebViewLocalServer$PathHandler;Ljava/lang/String;)V

    goto :goto_0

    :cond_1
    return-void

    .line 610
    :cond_2
    new-instance v0, Ljava/lang/IllegalArgumentException;

    const-string v1, "assetPath cannot contain the \'*\' character."

    invoke-direct {v0, v1}, Ljava/lang/IllegalArgumentException;-><init>(Ljava/lang/String;)V

    throw v0
.end method

.method private getMimeType(Ljava/lang/String;Ljava/io/InputStream;)Ljava/lang/String;
    .locals 3

    .line 526
    :try_start_0
    invoke-static {p1}, Ljava/net/URLConnection;->guessContentTypeFromName(Ljava/lang/String;)Ljava/lang/String;

    move-result-object v0
    :try_end_0
    .catch Ljava/lang/Exception; {:try_start_0 .. :try_end_0} :catch_1

    const-string v1, ".js"

    if-eqz v0, :cond_0

    .line 527
    :try_start_1
    invoke-virtual {p1, v1}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z

    move-result v2

    if-eqz v2, :cond_0

    const-string v2, "image/x-icon"

    invoke-virtual {v0, v2}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v2

    if-eqz v2, :cond_0

    const-string v2, "We shouldn\'t be here"

    .line 528
    invoke-static {v2}, Lcom/getcapacitor/Logger;->debug(Ljava/lang/String;)V

    goto :goto_0

    :catch_0
    move-exception p2

    goto :goto_2

    :cond_0
    :goto_0
    if-nez v0, :cond_4

    .line 531
    invoke-virtual {p1, v1}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z

    move-result v1

    if-nez v1, :cond_3

    const-string v1, ".mjs"

    invoke-virtual {p1, v1}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z

    move-result v1

    if-eqz v1, :cond_1

    goto :goto_1

    :cond_1
    const-string v1, ".wasm"

    .line 534
    invoke-virtual {p1, v1}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z

    move-result v1

    if-eqz v1, :cond_2

    const-string v0, "application/wasm"

    goto :goto_3

    .line 537
    :cond_2
    invoke-static {p2}, Ljava/net/URLConnection;->guessContentTypeFromStream(Ljava/io/InputStream;)Ljava/lang/String;

    move-result-object v0

    goto :goto_3

    :cond_3
    :goto_1
    const-string v0, "application/javascript"
    :try_end_1
    .catch Ljava/lang/Exception; {:try_start_1 .. :try_end_1} :catch_0

    goto :goto_3

    :catch_1
    move-exception p2

    const/4 v0, 0x0

    .line 541
    :goto_2
    new-instance v1, Ljava/lang/StringBuilder;

    const-string v2, "Unable to get mime type"

    invoke-direct {v1, v2}, Ljava/lang/StringBuilder;-><init>(Ljava/lang/String;)V

    invoke-virtual {v1, p1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v1}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object p1

    invoke-static {p1, p2}, Lcom/getcapacitor/Logger;->error(Ljava/lang/String;Ljava/lang/Throwable;)V

    :cond_4
    :goto_3
    return-object v0
.end method

.method private getReasonPhraseFromResponseCode(I)Ljava/lang/String;
    .locals 1

    const/16 v0, 0x64

    if-eq p1, v0, :cond_3

    const/16 v0, 0x65

    if-eq p1, v0, :cond_2

    const/16 v0, 0x190

    if-eq p1, v0, :cond_1

    const/16 v0, 0x191

    if-eq p1, v0, :cond_0

    packed-switch p1, :pswitch_data_0

    packed-switch p1, :pswitch_data_1

    packed-switch p1, :pswitch_data_2

    packed-switch p1, :pswitch_data_3

    const-string p1, "Unknown"

    goto/16 :goto_0

    :pswitch_0
    const-string p1, "HTTP Version Not Supported"

    goto/16 :goto_0

    :pswitch_1
    const-string p1, "Gateway Timeout"

    goto/16 :goto_0

    :pswitch_2
    const-string p1, "Service Unavailable"

    goto/16 :goto_0

    :pswitch_3
    const-string p1, "Bad Gateway"

    goto/16 :goto_0

    :pswitch_4
    const-string p1, "Not Implemented"

    goto :goto_0

    :pswitch_5
    const-string p1, "Internal Server Error"

    goto :goto_0

    :pswitch_6
    const-string p1, "Gone"

    goto :goto_0

    :pswitch_7
    const-string p1, "Conflict"

    goto :goto_0

    :pswitch_8
    const-string p1, "Request Timeout"

    goto :goto_0

    :pswitch_9
    const-string p1, "Proxy Authentication Required"

    goto :goto_0

    :pswitch_a
    const-string p1, "Not Acceptable"

    goto :goto_0

    :pswitch_b
    const-string p1, "Method Not Allowed"

    goto :goto_0

    :pswitch_c
    const-string p1, "Not Found"

    goto :goto_0

    :pswitch_d
    const-string p1, "Forbidden"

    goto :goto_0

    :pswitch_e
    const-string p1, "Not Modified"

    goto :goto_0

    :pswitch_f
    const-string p1, "See Other"

    goto :goto_0

    :pswitch_10
    const-string p1, "Found"

    goto :goto_0

    :pswitch_11
    const-string p1, "Moved Permanently"

    goto :goto_0

    :pswitch_12
    const-string p1, "Multiple Choices"

    goto :goto_0

    :pswitch_13
    const-string p1, "Partial Content"

    goto :goto_0

    :pswitch_14
    const-string p1, "Reset Content"

    goto :goto_0

    :pswitch_15
    const-string p1, "No Content"

    goto :goto_0

    :pswitch_16
    const-string p1, "Non-Authoritative Information"

    goto :goto_0

    :pswitch_17
    const-string p1, "Accepted"

    goto :goto_0

    :pswitch_18
    const-string p1, "Created"

    goto :goto_0

    :pswitch_19
    const-string p1, "OK"

    goto :goto_0

    :cond_0
    const-string p1, "Unauthorized"

    goto :goto_0

    :cond_1
    const-string p1, "Bad Request"

    goto :goto_0

    :cond_2
    const-string p1, "Switching Protocols"

    goto :goto_0

    :cond_3
    const-string p1, "Continue"

    :goto_0
    return-object p1

    :pswitch_data_0
    .packed-switch 0xc8
        :pswitch_19
        :pswitch_18
        :pswitch_17
        :pswitch_16
        :pswitch_15
        :pswitch_14
        :pswitch_13
    .end packed-switch

    :pswitch_data_1
    .packed-switch 0x12c
        :pswitch_12
        :pswitch_11
        :pswitch_10
        :pswitch_f
        :pswitch_e
    .end packed-switch

    :pswitch_data_2
    .packed-switch 0x193
        :pswitch_d
        :pswitch_c
        :pswitch_b
        :pswitch_a
        :pswitch_9
        :pswitch_8
        :pswitch_7
        :pswitch_6
    .end packed-switch

    :pswitch_data_3
    .packed-switch 0x1f4
        :pswitch_5
        :pswitch_4
        :pswitch_3
        :pswitch_2
        :pswitch_1
        :pswitch_0
    .end packed-switch
.end method

.method private getStatusCode(Ljava/io/InputStream;I)I
    .locals 1

    .line 549
    :try_start_0
    invoke-virtual {p1}, Ljava/io/InputStream;->available()I

    move-result p1
    :try_end_0
    .catch Ljava/io/IOException; {:try_start_0 .. :try_end_0} :catch_0

    const/4 v0, -0x1

    if-ne p1, v0, :cond_0

    const/16 p2, 0x194

    goto :goto_0

    :catch_0
    const/16 p2, 0x1f4

    :cond_0
    :goto_0
    return p2
.end method

.method private handleCapacitorHttpRequest(Landroid/webkit/WebResourceRequest;)Landroid/webkit/WebResourceResponse;
    .locals 9
    .annotation system Ldalvik/annotation/Throws;
        value = {
            Ljava/io/IOException;
        }
    .end annotation

    .line 255
    invoke-interface {p1}, Landroid/webkit/WebResourceRequest;->getUrl()Landroid/net/Uri;

    move-result-object v0

    const-string v1, "u"

    invoke-virtual {v0, v1}, Landroid/net/Uri;->getQueryParameter(Ljava/lang/String;)Ljava/lang/String;

    move-result-object v0

    .line 256
    new-instance v1, Ljava/net/URL;

    invoke-direct {v1, v0}, Ljava/net/URL;-><init>(Ljava/lang/String;)V

    .line 257
    new-instance v0, Lcom/getcapacitor/JSObject;

    invoke-direct {v0}, Lcom/getcapacitor/JSObject;-><init>()V

    .line 259
    invoke-interface {p1}, Landroid/webkit/WebResourceRequest;->getRequestHeaders()Ljava/util/Map;

    move-result-object v2

    invoke-interface {v2}, Ljava/util/Map;->entrySet()Ljava/util/Set;

    move-result-object v2

    invoke-interface {v2}, Ljava/util/Set;->iterator()Ljava/util/Iterator;

    move-result-object v2

    :goto_0
    invoke-interface {v2}, Ljava/util/Iterator;->hasNext()Z

    move-result v3

    if-eqz v3, :cond_0

    invoke-interface {v2}, Ljava/util/Iterator;->next()Ljava/lang/Object;

    move-result-object v3

    check-cast v3, Ljava/util/Map$Entry;

    .line 260
    invoke-interface {v3}, Ljava/util/Map$Entry;->getKey()Ljava/lang/Object;

    move-result-object v4

    check-cast v4, Ljava/lang/String;

    invoke-interface {v3}, Ljava/util/Map$Entry;->getValue()Ljava/lang/Object;

    move-result-object v3

    check-cast v3, Ljava/lang/String;

    invoke-virtual {v0, v4, v3}, Lcom/getcapacitor/JSObject;->put(Ljava/lang/String;Ljava/lang/String;)Lcom/getcapacitor/JSObject;

    goto :goto_0

    .line 263
    :cond_0
    new-instance v2, Lcom/getcapacitor/plugin/util/HttpRequestHandler$HttpURLConnectionBuilder;

    invoke-direct {v2}, Lcom/getcapacitor/plugin/util/HttpRequestHandler$HttpURLConnectionBuilder;-><init>()V

    .line 264
    invoke-virtual {v2, v1}, Lcom/getcapacitor/plugin/util/HttpRequestHandler$HttpURLConnectionBuilder;->setUrl(Ljava/net/URL;)Lcom/getcapacitor/plugin/util/HttpRequestHandler$HttpURLConnectionBuilder;

    move-result-object v2

    .line 265
    invoke-interface {p1}, Landroid/webkit/WebResourceRequest;->getMethod()Ljava/lang/String;

    move-result-object v3

    invoke-virtual {v2, v3}, Lcom/getcapacitor/plugin/util/HttpRequestHandler$HttpURLConnectionBuilder;->setMethod(Ljava/lang/String;)Lcom/getcapacitor/plugin/util/HttpRequestHandler$HttpURLConnectionBuilder;

    move-result-object v2

    .line 266
    invoke-virtual {v2, v0}, Lcom/getcapacitor/plugin/util/HttpRequestHandler$HttpURLConnectionBuilder;->setHeaders(Lcom/getcapacitor/JSObject;)Lcom/getcapacitor/plugin/util/HttpRequestHandler$HttpURLConnectionBuilder;

    move-result-object v0

    .line 267
    invoke-virtual {v0}, Lcom/getcapacitor/plugin/util/HttpRequestHandler$HttpURLConnectionBuilder;->openConnection()Lcom/getcapacitor/plugin/util/HttpRequestHandler$HttpURLConnectionBuilder;

    move-result-object v0

    .line 269
    invoke-virtual {v0}, Lcom/getcapacitor/plugin/util/HttpRequestHandler$HttpURLConnectionBuilder;->build()Lcom/getcapacitor/plugin/util/CapacitorHttpUrlConnection;

    move-result-object v0

    iget-object v2, p0, Lcom/getcapacitor/WebViewLocalServer;->bridge:Lcom/getcapacitor/Bridge;

    .line 271
    invoke-static {v2, v1}, Lcom/getcapacitor/plugin/util/HttpRequestHandler;->isDomainExcludedFromSSL(Lcom/getcapacitor/Bridge;Ljava/net/URL;)Ljava/lang/Boolean;

    move-result-object v1

    invoke-virtual {v1}, Ljava/lang/Boolean;->booleanValue()Z

    move-result v1

    if-nez v1, :cond_1

    iget-object v1, p0, Lcom/getcapacitor/WebViewLocalServer;->bridge:Lcom/getcapacitor/Bridge;

    .line 272
    invoke-virtual {v0, v1}, Lcom/getcapacitor/plugin/util/CapacitorHttpUrlConnection;->setSSLSocketFactory(Lcom/getcapacitor/Bridge;)V

    .line 275
    :cond_1
    invoke-virtual {v0}, Lcom/getcapacitor/plugin/util/CapacitorHttpUrlConnection;->connect()V

    .line 279
    new-instance v7, Ljava/util/LinkedHashMap;

    invoke-direct {v7}, Ljava/util/LinkedHashMap;-><init>()V

    .line 280
    invoke-virtual {v0}, Lcom/getcapacitor/plugin/util/CapacitorHttpUrlConnection;->getHeaderFields()Ljava/util/Map;

    move-result-object v1

    invoke-interface {v1}, Ljava/util/Map;->entrySet()Ljava/util/Set;

    move-result-object v1

    invoke-interface {v1}, Ljava/util/Set;->iterator()Ljava/util/Iterator;

    move-result-object v1

    const/4 v2, 0x0

    move-object v4, v2

    :goto_1
    invoke-interface {v1}, Ljava/util/Iterator;->hasNext()Z

    move-result v3

    if-eqz v3, :cond_5

    invoke-interface {v1}, Ljava/util/Iterator;->next()Ljava/lang/Object;

    move-result-object v3

    check-cast v3, Ljava/util/Map$Entry;

    .line 281
    new-instance v5, Ljava/lang/StringBuilder;

    invoke-direct {v5}, Ljava/lang/StringBuilder;-><init>()V

    .line 282
    invoke-interface {v3}, Ljava/util/Map$Entry;->getValue()Ljava/lang/Object;

    move-result-object v6

    check-cast v6, Ljava/util/List;

    invoke-interface {v6}, Ljava/util/List;->iterator()Ljava/util/Iterator;

    move-result-object v6

    :goto_2
    invoke-interface {v6}, Ljava/util/Iterator;->hasNext()Z

    move-result v8

    if-eqz v8, :cond_2

    invoke-interface {v6}, Ljava/util/Iterator;->next()Ljava/lang/Object;

    move-result-object v8

    check-cast v8, Ljava/lang/String;

    .line 283
    invoke-virtual {v5, v8}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    const-string v8, ", "

    .line 284
    invoke-virtual {v5, v8}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    goto :goto_2

    .line 286
    :cond_2
    invoke-virtual {v5}, Ljava/lang/StringBuilder;->length()I

    move-result v6

    add-int/lit8 v6, v6, -0x2

    invoke-virtual {v5, v6}, Ljava/lang/StringBuilder;->setLength(I)V

    .line 288
    invoke-interface {v3}, Ljava/util/Map$Entry;->getKey()Ljava/lang/Object;

    move-result-object v6

    check-cast v6, Ljava/lang/String;

    const-string v8, "Content-Type"

    invoke-virtual {v8, v6}, Ljava/lang/String;->equalsIgnoreCase(Ljava/lang/String;)Z

    move-result v6

    if-eqz v6, :cond_4

    .line 289
    invoke-virtual {v5}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object v2

    const-string v3, ";"

    invoke-virtual {v2, v3}, Ljava/lang/String;->split(Ljava/lang/String;)[Ljava/lang/String;

    move-result-object v2

    const/4 v3, 0x0

    .line 290
    aget-object v3, v2, v3

    invoke-virtual {v3}, Ljava/lang/String;->trim()Ljava/lang/String;

    move-result-object v3

    .line 291
    array-length v5, v2

    const/4 v6, 0x1

    if-le v5, v6, :cond_3

    .line 292
    aget-object v2, v2, v6

    const-string v5, "="

    invoke-virtual {v2, v5}, Ljava/lang/String;->split(Ljava/lang/String;)[Ljava/lang/String;

    move-result-object v2

    .line 293
    array-length v5, v2

    if-le v5, v6, :cond_3

    .line 294
    aget-object v2, v2, v6

    invoke-virtual {v2}, Ljava/lang/String;->trim()Ljava/lang/String;

    move-result-object v2

    move-object v4, v2

    :cond_3
    move-object v2, v3

    goto :goto_1

    .line 298
    :cond_4
    invoke-interface {v3}, Ljava/util/Map$Entry;->getKey()Ljava/lang/Object;

    move-result-object v3

    check-cast v3, Ljava/lang/String;

    invoke-virtual {v5}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object v5

    invoke-interface {v7, v3, v5}, Ljava/util/Map;->put(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;

    goto :goto_1

    .line 302
    :cond_5
    invoke-virtual {v0}, Lcom/getcapacitor/plugin/util/CapacitorHttpUrlConnection;->getErrorStream()Ljava/io/InputStream;

    move-result-object v1

    if-nez v1, :cond_6

    .line 304
    invoke-virtual {v0}, Lcom/getcapacitor/plugin/util/CapacitorHttpUrlConnection;->getInputStream()Ljava/io/InputStream;

    move-result-object v1

    :cond_6
    move-object v8, v1

    if-nez v2, :cond_7

    .line 308
    invoke-interface {p1}, Landroid/webkit/WebResourceRequest;->getUrl()Landroid/net/Uri;

    move-result-object p1

    invoke-virtual {p1}, Landroid/net/Uri;->getPath()Ljava/lang/String;

    move-result-object p1

    invoke-direct {p0, p1, v8}, Lcom/getcapacitor/WebViewLocalServer;->getMimeType(Ljava/lang/String;Ljava/io/InputStream;)Ljava/lang/String;

    move-result-object p1

    move-object v3, p1

    goto :goto_3

    :cond_7
    move-object v3, v2

    .line 311
    :goto_3
    invoke-virtual {v0}, Lcom/getcapacitor/plugin/util/CapacitorHttpUrlConnection;->getResponseCode()I

    move-result v5

    .line 312
    invoke-direct {p0, v5}, Lcom/getcapacitor/WebViewLocalServer;->getReasonPhraseFromResponseCode(I)Ljava/lang/String;

    move-result-object v6

    .line 314
    new-instance p1, Landroid/webkit/WebResourceResponse;

    move-object v2, p1

    invoke-direct/range {v2 .. v8}, Landroid/webkit/WebResourceResponse;-><init>(Ljava/lang/String;Ljava/lang/String;ILjava/lang/String;Ljava/util/Map;Ljava/io/InputStream;)V

    return-object p1
.end method

.method private handleLocalRequest(Landroid/webkit/WebResourceRequest;Lcom/getcapacitor/WebViewLocalServer$PathHandler;)Landroid/webkit/WebResourceResponse;
    .locals 17

    move-object/from16 v1, p0

    move-object/from16 v2, p1

    move-object/from16 v3, p2

    const-string v0, "-"

    const-string v4, "/index.html"

    const-string v5, "bytes "

    .line 318
    invoke-interface/range {p1 .. p1}, Landroid/webkit/WebResourceRequest;->getUrl()Landroid/net/Uri;

    move-result-object v6

    invoke-virtual {v6}, Landroid/net/Uri;->getPath()Ljava/lang/String;

    move-result-object v6

    .line 320
    invoke-interface/range {p1 .. p1}, Landroid/webkit/WebResourceRequest;->getRequestHeaders()Ljava/util/Map;

    move-result-object v7

    const-string v8, "Range"

    invoke-interface {v7, v8}, Ljava/util/Map;->get(Ljava/lang/Object;)Ljava/lang/Object;

    move-result-object v7

    const-string v9, "/"

    if-eqz v7, :cond_1

    .line 321
    new-instance v4, Lcom/getcapacitor/WebViewLocalServer$LollipopLazyInputStream;

    invoke-direct {v4, v3, v2}, Lcom/getcapacitor/WebViewLocalServer$LollipopLazyInputStream;-><init>(Lcom/getcapacitor/WebViewLocalServer$PathHandler;Landroid/webkit/WebResourceRequest;)V

    .line 322
    invoke-direct {v1, v6, v4}, Lcom/getcapacitor/WebViewLocalServer;->getMimeType(Ljava/lang/String;Ljava/io/InputStream;)Ljava/lang/String;

    move-result-object v11

    .line 323
    invoke-virtual/range {p2 .. p2}, Lcom/getcapacitor/WebViewLocalServer$PathHandler;->getResponseHeaders()Ljava/util/Map;

    move-result-object v15

    .line 326
    :try_start_0
    invoke-virtual {v4}, Ljava/io/InputStream;->available()I

    move-result v6

    .line 327
    invoke-interface/range {p1 .. p1}, Landroid/webkit/WebResourceRequest;->getRequestHeaders()Ljava/util/Map;

    move-result-object v2

    invoke-interface {v2, v8}, Ljava/util/Map;->get(Ljava/lang/Object;)Ljava/lang/Object;

    move-result-object v2

    check-cast v2, Ljava/lang/String;

    const-string v7, "="

    .line 328
    invoke-virtual {v2, v7}, Ljava/lang/String;->split(Ljava/lang/String;)[Ljava/lang/String;

    move-result-object v2

    const/4 v7, 0x1

    .line 329
    aget-object v2, v2, v7

    invoke-virtual {v2, v0}, Ljava/lang/String;->split(Ljava/lang/String;)[Ljava/lang/String;

    move-result-object v2

    const/4 v8, 0x0

    .line 330
    aget-object v8, v2, v8

    add-int/lit8 v10, v6, -0x1

    .line 332
    array-length v12, v2

    if-le v12, v7, :cond_0

    .line 333
    aget-object v2, v2, v7

    invoke-static {v2}, Ljava/lang/Integer;->parseInt(Ljava/lang/String;)I

    move-result v10

    :cond_0
    const-string v2, "Accept-Ranges"

    const-string v7, "bytes"

    .line 335
    invoke-interface {v15, v2, v7}, Ljava/util/Map;->put(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;

    const-string v2, "Content-Range"

    .line 336
    new-instance v7, Ljava/lang/StringBuilder;

    invoke-direct {v7, v5}, Ljava/lang/StringBuilder;-><init>(Ljava/lang/String;)V

    invoke-virtual {v7, v8}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v7, v0}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v7, v10}, Ljava/lang/StringBuilder;->append(I)Ljava/lang/StringBuilder;

    invoke-virtual {v7, v9}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v7, v6}, Ljava/lang/StringBuilder;->append(I)Ljava/lang/StringBuilder;

    invoke-virtual {v7}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object v0

    invoke-interface {v15, v2, v0}, Ljava/util/Map;->put(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;
    :try_end_0
    .catch Ljava/io/IOException; {:try_start_0 .. :try_end_0} :catch_0

    const/16 v0, 0xce

    const/16 v13, 0xce

    goto :goto_0

    :catch_0
    const/16 v0, 0x194

    const/16 v13, 0x194

    .line 340
    :goto_0
    new-instance v0, Landroid/webkit/WebResourceResponse;

    .line 342
    invoke-virtual/range {p2 .. p2}, Lcom/getcapacitor/WebViewLocalServer$PathHandler;->getEncoding()Ljava/lang/String;

    move-result-object v12

    .line 344
    invoke-virtual/range {p2 .. p2}, Lcom/getcapacitor/WebViewLocalServer$PathHandler;->getReasonPhrase()Ljava/lang/String;

    move-result-object v14

    move-object v10, v0

    move-object/from16 v16, v4

    invoke-direct/range {v10 .. v16}, Landroid/webkit/WebResourceResponse;-><init>(Ljava/lang/String;Ljava/lang/String;ILjava/lang/String;Ljava/util/Map;Ljava/io/InputStream;)V

    return-object v0

    .line 350
    :cond_1
    invoke-interface/range {p1 .. p1}, Landroid/webkit/WebResourceRequest;->getUrl()Landroid/net/Uri;

    move-result-object v0

    invoke-direct {v1, v0}, Lcom/getcapacitor/WebViewLocalServer;->isLocalFile(Landroid/net/Uri;)Z

    move-result v0

    if-nez v0, :cond_c

    invoke-interface/range {p1 .. p1}, Landroid/webkit/WebResourceRequest;->getUrl()Landroid/net/Uri;

    move-result-object v0

    invoke-direct {v1, v0}, Lcom/getcapacitor/WebViewLocalServer;->isErrorUrl(Landroid/net/Uri;)Z

    move-result v0

    if-eqz v0, :cond_2

    goto/16 :goto_3

    :cond_2
    const-string v0, "/cordova.js"

    .line 364
    invoke-virtual {v6, v0}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v0

    if-eqz v0, :cond_3

    .line 365
    new-instance v0, Landroid/webkit/WebResourceResponse;

    const-string v11, "application/javascript"

    .line 367
    invoke-virtual/range {p2 .. p2}, Lcom/getcapacitor/WebViewLocalServer$PathHandler;->getEncoding()Ljava/lang/String;

    move-result-object v12

    .line 368
    invoke-virtual/range {p2 .. p2}, Lcom/getcapacitor/WebViewLocalServer$PathHandler;->getStatusCode()I

    move-result v13

    .line 369
    invoke-virtual/range {p2 .. p2}, Lcom/getcapacitor/WebViewLocalServer$PathHandler;->getReasonPhrase()Ljava/lang/String;

    move-result-object v14

    .line 370
    invoke-virtual/range {p2 .. p2}, Lcom/getcapacitor/WebViewLocalServer$PathHandler;->getResponseHeaders()Ljava/util/Map;

    move-result-object v15

    const/16 v16, 0x0

    move-object v10, v0

    invoke-direct/range {v10 .. v16}, Landroid/webkit/WebResourceResponse;-><init>(Ljava/lang/String;Ljava/lang/String;ILjava/lang/String;Ljava/util/Map;Ljava/io/InputStream;)V

    return-object v0

    .line 375
    :cond_3
    invoke-virtual {v6, v9}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v0

    const/4 v5, 0x0

    if-nez v0, :cond_8

    invoke-interface/range {p1 .. p1}, Landroid/webkit/WebResourceRequest;->getUrl()Landroid/net/Uri;

    move-result-object v0

    invoke-virtual {v0}, Landroid/net/Uri;->getLastPathSegment()Ljava/lang/String;

    move-result-object v0

    const-string v7, "."

    invoke-virtual {v0, v7}, Ljava/lang/String;->contains(Ljava/lang/CharSequence;)Z

    move-result v0

    if-nez v0, :cond_4

    iget-boolean v0, v1, Lcom/getcapacitor/WebViewLocalServer;->html5mode:Z

    if-eqz v0, :cond_4

    goto :goto_1

    :cond_4
    const-string v0, "/favicon.ico"

    .line 410
    invoke-virtual {v0, v6}, Ljava/lang/String;->equalsIgnoreCase(Ljava/lang/String;)Z

    move-result v0

    if-eqz v0, :cond_5

    .line 412
    :try_start_1
    new-instance v0, Landroid/webkit/WebResourceResponse;

    const-string v4, "image/png"

    invoke-direct {v0, v4, v5, v5}, Landroid/webkit/WebResourceResponse;-><init>(Ljava/lang/String;Ljava/lang/String;Ljava/io/InputStream;)V
    :try_end_1
    .catch Ljava/lang/Exception; {:try_start_1 .. :try_end_1} :catch_1

    return-object v0

    :catch_1
    move-exception v0

    const-string v4, "favicon handling failed"

    .line 414
    invoke-static {v4, v0}, Lcom/getcapacitor/Logger;->error(Ljava/lang/String;Ljava/lang/Throwable;)V

    .line 418
    :cond_5
    invoke-virtual {v6, v7}, Ljava/lang/String;->lastIndexOf(Ljava/lang/String;)I

    move-result v0

    if-ltz v0, :cond_7

    .line 420
    invoke-virtual {v6, v7}, Ljava/lang/String;->lastIndexOf(Ljava/lang/String;)I

    move-result v0

    invoke-virtual {v6, v0}, Ljava/lang/String;->substring(I)Ljava/lang/String;

    move-result-object v0

    .line 422
    new-instance v4, Lcom/getcapacitor/WebViewLocalServer$LollipopLazyInputStream;

    invoke-direct {v4, v3, v2}, Lcom/getcapacitor/WebViewLocalServer$LollipopLazyInputStream;-><init>(Lcom/getcapacitor/WebViewLocalServer$PathHandler;Landroid/webkit/WebResourceRequest;)V

    const-string v2, ".html"

    .line 425
    invoke-virtual {v0, v2}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v0

    if-eqz v0, :cond_6

    iget-object v0, v1, Lcom/getcapacitor/WebViewLocalServer;->jsInjector:Lcom/getcapacitor/JSInjector;

    if-eqz v0, :cond_6

    .line 426
    invoke-virtual {v0, v4}, Lcom/getcapacitor/JSInjector;->getInjectedStream(Ljava/io/InputStream;)Ljava/io/InputStream;

    move-result-object v4

    :cond_6
    move-object v13, v4

    .line 429
    invoke-direct {v1, v6, v13}, Lcom/getcapacitor/WebViewLocalServer;->getMimeType(Ljava/lang/String;Ljava/io/InputStream;)Ljava/lang/String;

    move-result-object v8

    .line 430
    invoke-virtual/range {p2 .. p2}, Lcom/getcapacitor/WebViewLocalServer$PathHandler;->getStatusCode()I

    move-result v0

    invoke-direct {v1, v13, v0}, Lcom/getcapacitor/WebViewLocalServer;->getStatusCode(Ljava/io/InputStream;I)I

    move-result v10

    .line 431
    new-instance v0, Landroid/webkit/WebResourceResponse;

    .line 433
    invoke-virtual/range {p2 .. p2}, Lcom/getcapacitor/WebViewLocalServer$PathHandler;->getEncoding()Ljava/lang/String;

    move-result-object v9

    .line 435
    invoke-virtual/range {p2 .. p2}, Lcom/getcapacitor/WebViewLocalServer$PathHandler;->getReasonPhrase()Ljava/lang/String;

    move-result-object v11

    .line 436
    invoke-virtual/range {p2 .. p2}, Lcom/getcapacitor/WebViewLocalServer$PathHandler;->getResponseHeaders()Ljava/util/Map;

    move-result-object v12

    move-object v7, v0

    invoke-direct/range {v7 .. v13}, Landroid/webkit/WebResourceResponse;-><init>(Ljava/lang/String;Ljava/lang/String;ILjava/lang/String;Ljava/util/Map;Ljava/io/InputStream;)V

    return-object v0

    :cond_7
    return-object v5

    .line 378
    :cond_8
    :goto_1
    :try_start_2
    new-instance v0, Ljava/lang/StringBuilder;

    invoke-direct {v0}, Ljava/lang/StringBuilder;-><init>()V

    iget-object v2, v1, Lcom/getcapacitor/WebViewLocalServer;->basePath:Ljava/lang/String;

    invoke-virtual {v0, v2}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v0, v4}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v0}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object v0

    iget-object v2, v1, Lcom/getcapacitor/WebViewLocalServer;->bridge:Lcom/getcapacitor/Bridge;

    .line 379
    invoke-virtual {v2}, Lcom/getcapacitor/Bridge;->getRouteProcessor()Lcom/getcapacitor/RouteProcessor;

    move-result-object v2

    if-eqz v2, :cond_9

    iget-object v0, v1, Lcom/getcapacitor/WebViewLocalServer;->bridge:Lcom/getcapacitor/Bridge;

    .line 380
    invoke-virtual {v0}, Lcom/getcapacitor/Bridge;->getRouteProcessor()Lcom/getcapacitor/RouteProcessor;

    move-result-object v0

    iget-object v2, v1, Lcom/getcapacitor/WebViewLocalServer;->basePath:Ljava/lang/String;

    invoke-interface {v0, v2, v4}, Lcom/getcapacitor/RouteProcessor;->process(Ljava/lang/String;Ljava/lang/String;)Lcom/getcapacitor/ProcessedRoute;

    move-result-object v0

    .line 381
    invoke-virtual {v0}, Lcom/getcapacitor/ProcessedRoute;->getPath()Ljava/lang/String;

    move-result-object v2

    .line 382
    invoke-virtual {v0}, Lcom/getcapacitor/ProcessedRoute;->isAsset()Z

    move-result v0

    iput-boolean v0, v1, Lcom/getcapacitor/WebViewLocalServer;->isAsset:Z

    move-object v0, v2

    :cond_9
    iget-boolean v2, v1, Lcom/getcapacitor/WebViewLocalServer;->isAsset:Z

    if-eqz v2, :cond_a

    iget-object v2, v1, Lcom/getcapacitor/WebViewLocalServer;->protocolHandler:Lcom/getcapacitor/AndroidProtocolHandler;

    .line 386
    invoke-virtual {v2, v0}, Lcom/getcapacitor/AndroidProtocolHandler;->openAsset(Ljava/lang/String;)Ljava/io/InputStream;

    move-result-object v0

    goto :goto_2

    :cond_a
    iget-object v2, v1, Lcom/getcapacitor/WebViewLocalServer;->protocolHandler:Lcom/getcapacitor/AndroidProtocolHandler;

    .line 388
    invoke-virtual {v2, v0}, Lcom/getcapacitor/AndroidProtocolHandler;->openFile(Ljava/lang/String;)Ljava/io/InputStream;

    move-result-object v0
    :try_end_2
    .catch Ljava/io/IOException; {:try_start_2 .. :try_end_2} :catch_2

    :goto_2
    iget-object v2, v1, Lcom/getcapacitor/WebViewLocalServer;->jsInjector:Lcom/getcapacitor/JSInjector;

    if-eqz v2, :cond_b

    .line 396
    invoke-virtual {v2, v0}, Lcom/getcapacitor/JSInjector;->getInjectedStream(Ljava/io/InputStream;)Ljava/io/InputStream;

    move-result-object v0

    :cond_b
    move-object v8, v0

    .line 399
    invoke-virtual/range {p2 .. p2}, Lcom/getcapacitor/WebViewLocalServer$PathHandler;->getStatusCode()I

    move-result v0

    invoke-direct {v1, v8, v0}, Lcom/getcapacitor/WebViewLocalServer;->getStatusCode(Ljava/io/InputStream;I)I

    move-result v5

    .line 400
    new-instance v0, Landroid/webkit/WebResourceResponse;

    const-string v4, "text/html"

    .line 402
    invoke-virtual/range {p2 .. p2}, Lcom/getcapacitor/WebViewLocalServer$PathHandler;->getEncoding()Ljava/lang/String;

    move-result-object v6

    .line 404
    invoke-virtual/range {p2 .. p2}, Lcom/getcapacitor/WebViewLocalServer$PathHandler;->getReasonPhrase()Ljava/lang/String;

    move-result-object v7

    .line 405
    invoke-virtual/range {p2 .. p2}, Lcom/getcapacitor/WebViewLocalServer$PathHandler;->getResponseHeaders()Ljava/util/Map;

    move-result-object v9

    move-object v2, v0

    move-object v3, v4

    move-object v4, v6

    move-object v6, v7

    move-object v7, v9

    invoke-direct/range {v2 .. v8}, Landroid/webkit/WebResourceResponse;-><init>(Ljava/lang/String;Ljava/lang/String;ILjava/lang/String;Ljava/util/Map;Ljava/io/InputStream;)V

    return-object v0

    :catch_2
    move-exception v0

    const-string v2, "Unable to open index.html"

    .line 391
    invoke-static {v2, v0}, Lcom/getcapacitor/Logger;->error(Ljava/lang/String;Ljava/lang/Throwable;)V

    return-object v5

    .line 351
    :cond_c
    :goto_3
    new-instance v12, Lcom/getcapacitor/WebViewLocalServer$LollipopLazyInputStream;

    invoke-direct {v12, v3, v2}, Lcom/getcapacitor/WebViewLocalServer$LollipopLazyInputStream;-><init>(Lcom/getcapacitor/WebViewLocalServer$PathHandler;Landroid/webkit/WebResourceRequest;)V

    .line 352
    invoke-interface/range {p1 .. p1}, Landroid/webkit/WebResourceRequest;->getUrl()Landroid/net/Uri;

    move-result-object v0

    invoke-virtual {v0}, Landroid/net/Uri;->getPath()Ljava/lang/String;

    move-result-object v0

    invoke-direct {v1, v0, v12}, Lcom/getcapacitor/WebViewLocalServer;->getMimeType(Ljava/lang/String;Ljava/io/InputStream;)Ljava/lang/String;

    move-result-object v7

    .line 353
    invoke-virtual/range {p2 .. p2}, Lcom/getcapacitor/WebViewLocalServer$PathHandler;->getStatusCode()I

    move-result v0

    invoke-direct {v1, v12, v0}, Lcom/getcapacitor/WebViewLocalServer;->getStatusCode(Ljava/io/InputStream;I)I

    move-result v9

    .line 354
    new-instance v0, Landroid/webkit/WebResourceResponse;

    .line 356
    invoke-virtual/range {p2 .. p2}, Lcom/getcapacitor/WebViewLocalServer$PathHandler;->getEncoding()Ljava/lang/String;

    move-result-object v8

    .line 358
    invoke-virtual/range {p2 .. p2}, Lcom/getcapacitor/WebViewLocalServer$PathHandler;->getReasonPhrase()Ljava/lang/String;

    move-result-object v10

    .line 359
    invoke-virtual/range {p2 .. p2}, Lcom/getcapacitor/WebViewLocalServer$PathHandler;->getResponseHeaders()Ljava/util/Map;

    move-result-object v11

    move-object v6, v0

    invoke-direct/range {v6 .. v12}, Landroid/webkit/WebResourceResponse;-><init>(Ljava/lang/String;Ljava/lang/String;ILjava/lang/String;Ljava/util/Map;Ljava/io/InputStream;)V

    return-object v0
.end method

.method private handleProxyRequest(Landroid/webkit/WebResourceRequest;Lcom/getcapacitor/WebViewLocalServer$PathHandler;)Landroid/webkit/WebResourceResponse;
    .locals 8

    iget-object v0, p0, Lcom/getcapacitor/WebViewLocalServer;->jsInjector:Lcom/getcapacitor/JSInjector;

    if-eqz v0, :cond_5

    .line 467
    invoke-interface {p1}, Landroid/webkit/WebResourceRequest;->getMethod()Ljava/lang/String;

    move-result-object v0

    const-string v1, "GET"

    .line 468
    invoke-virtual {v0, v1}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v1

    if-eqz v1, :cond_5

    .line 470
    :try_start_0
    invoke-interface {p1}, Landroid/webkit/WebResourceRequest;->getUrl()Landroid/net/Uri;

    move-result-object v1

    invoke-virtual {v1}, Landroid/net/Uri;->toString()Ljava/lang/String;

    move-result-object v1

    .line 471
    invoke-interface {p1}, Landroid/webkit/WebResourceRequest;->getRequestHeaders()Ljava/util/Map;

    move-result-object v2

    .line 473
    invoke-interface {v2}, Ljava/util/Map;->entrySet()Ljava/util/Set;

    move-result-object v3

    invoke-interface {v3}, Ljava/util/Set;->iterator()Ljava/util/Iterator;

    move-result-object v3

    :cond_0
    invoke-interface {v3}, Ljava/util/Iterator;->hasNext()Z

    move-result v4

    if-eqz v4, :cond_5

    invoke-interface {v3}, Ljava/util/Iterator;->next()Ljava/lang/Object;

    move-result-object v4

    check-cast v4, Ljava/util/Map$Entry;

    .line 474
    invoke-interface {v4}, Ljava/util/Map$Entry;->getKey()Ljava/lang/Object;

    move-result-object v5

    check-cast v5, Ljava/lang/String;

    const-string v6, "Accept"

    invoke-virtual {v5, v6}, Ljava/lang/String;->equalsIgnoreCase(Ljava/lang/String;)Z

    move-result v5

    if-eqz v5, :cond_0

    invoke-interface {v4}, Ljava/util/Map$Entry;->getValue()Ljava/lang/Object;

    move-result-object v4

    check-cast v4, Ljava/lang/String;

    invoke-virtual {v4}, Ljava/lang/String;->toLowerCase()Ljava/lang/String;

    move-result-object v4

    const-string v5, "text/html"

    invoke-virtual {v4, v5}, Ljava/lang/String;->contains(Ljava/lang/CharSequence;)Z

    move-result v4

    if-eqz v4, :cond_0

    .line 480
    new-instance v3, Ljava/net/URL;

    invoke-direct {v3, v1}, Ljava/net/URL;-><init>(Ljava/lang/String;)V

    invoke-virtual {v3}, Ljava/net/URL;->openConnection()Ljava/net/URLConnection;

    move-result-object v3

    check-cast v3, Ljava/net/HttpURLConnection;

    .line 481
    invoke-interface {v2}, Ljava/util/Map;->entrySet()Ljava/util/Set;

    move-result-object v2

    invoke-interface {v2}, Ljava/util/Set;->iterator()Ljava/util/Iterator;

    move-result-object v2

    :goto_0
    invoke-interface {v2}, Ljava/util/Iterator;->hasNext()Z

    move-result v4

    if-eqz v4, :cond_1

    invoke-interface {v2}, Ljava/util/Iterator;->next()Ljava/lang/Object;

    move-result-object v4

    check-cast v4, Ljava/util/Map$Entry;

    .line 482
    invoke-interface {v4}, Ljava/util/Map$Entry;->getKey()Ljava/lang/Object;

    move-result-object v5

    check-cast v5, Ljava/lang/String;

    invoke-interface {v4}, Ljava/util/Map$Entry;->getValue()Ljava/lang/Object;

    move-result-object v4

    check-cast v4, Ljava/lang/String;

    invoke-virtual {v3, v5, v4}, Ljava/net/HttpURLConnection;->setRequestProperty(Ljava/lang/String;Ljava/lang/String;)V

    goto :goto_0

    .line 484
    :cond_1
    invoke-static {}, Landroid/webkit/CookieManager;->getInstance()Landroid/webkit/CookieManager;

    move-result-object v2

    invoke-virtual {v2, v1}, Landroid/webkit/CookieManager;->getCookie(Ljava/lang/String;)Ljava/lang/String;

    move-result-object v2

    if-eqz v2, :cond_2

    const-string v4, "Cookie"

    .line 486
    invoke-virtual {v3, v4, v2}, Ljava/net/HttpURLConnection;->setRequestProperty(Ljava/lang/String;Ljava/lang/String;)V

    .line 488
    :cond_2
    invoke-virtual {v3, v0}, Ljava/net/HttpURLConnection;->setRequestMethod(Ljava/lang/String;)V

    const/16 v0, 0x7530

    .line 489
    invoke-virtual {v3, v0}, Ljava/net/HttpURLConnection;->setReadTimeout(I)V

    .line 490
    invoke-virtual {v3, v0}, Ljava/net/HttpURLConnection;->setConnectTimeout(I)V

    .line 491
    invoke-interface {p1}, Landroid/webkit/WebResourceRequest;->getUrl()Landroid/net/Uri;

    move-result-object v0

    invoke-virtual {v0}, Landroid/net/Uri;->getUserInfo()Ljava/lang/String;

    move-result-object v0

    if-eqz v0, :cond_3

    .line 492
    invoke-interface {p1}, Landroid/webkit/WebResourceRequest;->getUrl()Landroid/net/Uri;

    move-result-object p1

    invoke-virtual {p1}, Landroid/net/Uri;->getUserInfo()Ljava/lang/String;

    move-result-object p1

    sget-object v0, Ljava/nio/charset/StandardCharsets;->UTF_8:Ljava/nio/charset/Charset;

    invoke-virtual {p1, v0}, Ljava/lang/String;->getBytes(Ljava/nio/charset/Charset;)[B

    move-result-object p1

    const/4 v0, 0x2

    .line 493
    invoke-static {p1, v0}, Landroid/util/Base64;->encodeToString([BI)Ljava/lang/String;

    move-result-object p1

    const-string v0, "Authorization"

    .line 494
    new-instance v2, Ljava/lang/StringBuilder;

    invoke-direct {v2}, Ljava/lang/StringBuilder;-><init>()V

    const-string v4, "Basic "

    invoke-virtual {v2, v4}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v2, p1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v2}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object p1

    invoke-virtual {v3, v0, p1}, Ljava/net/HttpURLConnection;->setRequestProperty(Ljava/lang/String;Ljava/lang/String;)V

    .line 497
    :cond_3
    invoke-virtual {v3}, Ljava/net/HttpURLConnection;->getHeaderFields()Ljava/util/Map;

    move-result-object p1

    const-string v0, "Set-Cookie"

    invoke-interface {p1, v0}, Ljava/util/Map;->get(Ljava/lang/Object;)Ljava/lang/Object;

    move-result-object p1

    check-cast p1, Ljava/util/List;

    if-eqz p1, :cond_4

    .line 499
    invoke-interface {p1}, Ljava/util/List;->iterator()Ljava/util/Iterator;

    move-result-object p1

    :goto_1
    invoke-interface {p1}, Ljava/util/Iterator;->hasNext()Z

    move-result v0

    if-eqz v0, :cond_4

    invoke-interface {p1}, Ljava/util/Iterator;->next()Ljava/lang/Object;

    move-result-object v0

    check-cast v0, Ljava/lang/String;

    .line 500
    invoke-static {}, Landroid/webkit/CookieManager;->getInstance()Landroid/webkit/CookieManager;

    move-result-object v2

    invoke-virtual {v2, v1, v0}, Landroid/webkit/CookieManager;->setCookie(Ljava/lang/String;Ljava/lang/String;)V

    goto :goto_1

    .line 503
    :cond_4
    invoke-virtual {v3}, Ljava/net/HttpURLConnection;->getInputStream()Ljava/io/InputStream;

    move-result-object p1

    iget-object v0, p0, Lcom/getcapacitor/WebViewLocalServer;->jsInjector:Lcom/getcapacitor/JSInjector;

    .line 504
    invoke-virtual {v0, p1}, Lcom/getcapacitor/JSInjector;->getInjectedStream(Ljava/io/InputStream;)Ljava/io/InputStream;

    move-result-object v7

    .line 506
    new-instance p1, Landroid/webkit/WebResourceResponse;

    const-string v2, "text/html"

    .line 508
    invoke-virtual {p2}, Lcom/getcapacitor/WebViewLocalServer$PathHandler;->getEncoding()Ljava/lang/String;

    move-result-object v3

    .line 509
    invoke-virtual {p2}, Lcom/getcapacitor/WebViewLocalServer$PathHandler;->getStatusCode()I

    move-result v4

    .line 510
    invoke-virtual {p2}, Lcom/getcapacitor/WebViewLocalServer$PathHandler;->getReasonPhrase()Ljava/lang/String;

    move-result-object v5

    .line 511
    invoke-virtual {p2}, Lcom/getcapacitor/WebViewLocalServer$PathHandler;->getResponseHeaders()Ljava/util/Map;

    move-result-object v6

    move-object v1, p1

    invoke-direct/range {v1 .. v7}, Landroid/webkit/WebResourceResponse;-><init>(Ljava/lang/String;Ljava/lang/String;ILjava/lang/String;Ljava/util/Map;Ljava/io/InputStream;)V
    :try_end_0
    .catch Ljava/lang/Exception; {:try_start_0 .. :try_end_0} :catch_0

    return-object p1

    :catch_0
    move-exception p1

    iget-object p2, p0, Lcom/getcapacitor/WebViewLocalServer;->bridge:Lcom/getcapacitor/Bridge;

    .line 516
    invoke-virtual {p2, p1}, Lcom/getcapacitor/Bridge;->handleAppUrlLoadError(Ljava/lang/Exception;)V

    :cond_5
    const/4 p1, 0x0

    return-object p1
.end method

.method private isAllowedUrl(Landroid/net/Uri;)Z
    .locals 1

    iget-object v0, p0, Lcom/getcapacitor/WebViewLocalServer;->bridge:Lcom/getcapacitor/Bridge;

    .line 215
    invoke-virtual {v0}, Lcom/getcapacitor/Bridge;->getServerUrl()Ljava/lang/String;

    move-result-object v0

    if-nez v0, :cond_1

    iget-object v0, p0, Lcom/getcapacitor/WebViewLocalServer;->bridge:Lcom/getcapacitor/Bridge;

    invoke-virtual {v0}, Lcom/getcapacitor/Bridge;->getAppAllowNavigationMask()Lcom/getcapacitor/util/HostMask;

    move-result-object v0

    invoke-virtual {p1}, Landroid/net/Uri;->getHost()Ljava/lang/String;

    move-result-object p1

    invoke-interface {v0, p1}, Lcom/getcapacitor/util/HostMask;->matches(Ljava/lang/String;)Z

    move-result p1

    if-eqz p1, :cond_0

    goto :goto_0

    :cond_0
    const/4 p1, 0x0

    goto :goto_1

    :cond_1
    :goto_0
    const/4 p1, 0x1

    :goto_1
    return p1
.end method

.method private isErrorUrl(Landroid/net/Uri;)Z
    .locals 1

    .line 206
    invoke-virtual {p1}, Landroid/net/Uri;->toString()Ljava/lang/String;

    move-result-object p1

    iget-object v0, p0, Lcom/getcapacitor/WebViewLocalServer;->bridge:Lcom/getcapacitor/Bridge;

    .line 207
    invoke-virtual {v0}, Lcom/getcapacitor/Bridge;->getErrorUrl()Ljava/lang/String;

    move-result-object v0

    invoke-virtual {p1, v0}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result p1

    return p1
.end method

.method private isLocalFile(Landroid/net/Uri;)Z
    .locals 1

    .line 201
    invoke-virtual {p1}, Landroid/net/Uri;->getPath()Ljava/lang/String;

    move-result-object p1

    const-string v0, "/_capacitor_content_"

    .line 202
    invoke-virtual {p1, v0}, Ljava/lang/String;->startsWith(Ljava/lang/String;)Z

    move-result v0

    if-nez v0, :cond_1

    const-string v0, "/_capacitor_file_"

    invoke-virtual {p1, v0}, Ljava/lang/String;->startsWith(Ljava/lang/String;)Z

    move-result p1

    if-eqz p1, :cond_0

    goto :goto_0

    :cond_0
    const/4 p1, 0x0

    goto :goto_1

    :cond_1
    :goto_0
    const/4 p1, 0x1

    :goto_1
    return p1
.end method

.method private isMainUrl(Landroid/net/Uri;)Z
    .locals 1

    iget-object v0, p0, Lcom/getcapacitor/WebViewLocalServer;->bridge:Lcom/getcapacitor/Bridge;

    .line 211
    invoke-virtual {v0}, Lcom/getcapacitor/Bridge;->getServerUrl()Ljava/lang/String;

    move-result-object v0

    if-nez v0, :cond_0

    invoke-virtual {p1}, Landroid/net/Uri;->getHost()Ljava/lang/String;

    move-result-object p1

    iget-object v0, p0, Lcom/getcapacitor/WebViewLocalServer;->bridge:Lcom/getcapacitor/Bridge;

    invoke-virtual {v0}, Lcom/getcapacitor/Bridge;->getHost()Ljava/lang/String;

    move-result-object v0

    invoke-virtual {p1, v0}, Ljava/lang/String;->equalsIgnoreCase(Ljava/lang/String;)Z

    move-result p1

    if-eqz p1, :cond_0

    const/4 p1, 0x1

    goto :goto_0

    :cond_0
    const/4 p1, 0x0

    :goto_0
    return p1
.end method

.method private static parseAndVerifyUrl(Ljava/lang/String;)Landroid/net/Uri;
    .locals 3

    const/4 v0, 0x0

    if-nez p0, :cond_0

    return-object v0

    .line 149
    :cond_0
    invoke-static {p0}, Landroid/net/Uri;->parse(Ljava/lang/String;)Landroid/net/Uri;

    move-result-object v1

    if-nez v1, :cond_1

    .line 151
    new-instance v1, Ljava/lang/StringBuilder;

    const-string v2, "Malformed URL: "

    invoke-direct {v1, v2}, Ljava/lang/StringBuilder;-><init>(Ljava/lang/String;)V

    invoke-virtual {v1, p0}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v1}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object p0

    invoke-static {p0}, Lcom/getcapacitor/Logger;->error(Ljava/lang/String;)V

    return-object v0

    .line 154
    :cond_1
    invoke-virtual {v1}, Landroid/net/Uri;->getPath()Ljava/lang/String;

    move-result-object v2

    if-eqz v2, :cond_3

    .line 155
    invoke-virtual {v2}, Ljava/lang/String;->isEmpty()Z

    move-result v2

    if-eqz v2, :cond_2

    goto :goto_0

    :cond_2
    return-object v1

    .line 156
    :cond_3
    :goto_0
    new-instance v1, Ljava/lang/StringBuilder;

    const-string v2, "URL does not have a path: "

    invoke-direct {v1, v2}, Ljava/lang/StringBuilder;-><init>(Ljava/lang/String;)V

    invoke-virtual {v1, p0}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v1}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object p0

    invoke-static {p0}, Lcom/getcapacitor/Logger;->error(Ljava/lang/String;)V

    return-object v0
.end method

.method private registerUriForScheme(Ljava/lang/String;Lcom/getcapacitor/WebViewLocalServer$PathHandler;Ljava/lang/String;)V
    .locals 1

    .line 666
    new-instance v0, Landroid/net/Uri$Builder;

    invoke-direct {v0}, Landroid/net/Uri$Builder;-><init>()V

    .line 667
    invoke-virtual {v0, p1}, Landroid/net/Uri$Builder;->scheme(Ljava/lang/String;)Landroid/net/Uri$Builder;

    .line 668
    invoke-virtual {v0, p3}, Landroid/net/Uri$Builder;->authority(Ljava/lang/String;)Landroid/net/Uri$Builder;

    const-string p1, ""

    .line 669
    invoke-virtual {v0, p1}, Landroid/net/Uri$Builder;->path(Ljava/lang/String;)Landroid/net/Uri$Builder;

    .line 670
    invoke-virtual {v0}, Landroid/net/Uri$Builder;->build()Landroid/net/Uri;

    move-result-object p1

    const-string p3, "/"

    .line 672
    invoke-static {p1, p3}, Landroid/net/Uri;->withAppendedPath(Landroid/net/Uri;Ljava/lang/String;)Landroid/net/Uri;

    move-result-object p3

    invoke-virtual {p0, p3, p2}, Lcom/getcapacitor/WebViewLocalServer;->register(Landroid/net/Uri;Lcom/getcapacitor/WebViewLocalServer$PathHandler;)V

    const-string p3, "**"

    .line 673
    invoke-static {p1, p3}, Landroid/net/Uri;->withAppendedPath(Landroid/net/Uri;Ljava/lang/String;)Landroid/net/Uri;

    move-result-object p1

    invoke-virtual {p0, p1, p2}, Lcom/getcapacitor/WebViewLocalServer;->register(Landroid/net/Uri;Lcom/getcapacitor/WebViewLocalServer$PathHandler;)V

    return-void
.end method


# virtual methods
.method public getBasePath()Ljava/lang/String;
    .locals 1

    iget-object v0, p0, Lcom/getcapacitor/WebViewLocalServer;->basePath:Ljava/lang/String;

    return-object v0
.end method

.method public getJavaScriptInjectedStream(Ljava/io/InputStream;)Ljava/io/InputStream;
    .locals 1

    iget-object v0, p0, Lcom/getcapacitor/WebViewLocalServer;->jsInjector:Lcom/getcapacitor/JSInjector;

    if-eqz v0, :cond_0

    .line 453
    invoke-virtual {v0, p1}, Lcom/getcapacitor/JSInjector;->getInjectedStream(Ljava/io/InputStream;)Ljava/io/InputStream;

    move-result-object p1

    :cond_0
    return-object p1
.end method

.method public hostAssets(Ljava/lang/String;)V
    .locals 1

    const/4 v0, 0x1

    iput-boolean v0, p0, Lcom/getcapacitor/WebViewLocalServer;->isAsset:Z

    iput-object p1, p0, Lcom/getcapacitor/WebViewLocalServer;->basePath:Ljava/lang/String;

    .line 588
    invoke-direct {p0}, Lcom/getcapacitor/WebViewLocalServer;->createHostingDetails()V

    return-void
.end method

.method public hostFiles(Ljava/lang/String;)V
    .locals 1

    const/4 v0, 0x0

    iput-boolean v0, p0, Lcom/getcapacitor/WebViewLocalServer;->isAsset:Z

    iput-object p1, p0, Lcom/getcapacitor/WebViewLocalServer;->basePath:Ljava/lang/String;

    .line 603
    invoke-direct {p0}, Lcom/getcapacitor/WebViewLocalServer;->createHostingDetails()V

    return-void
.end method

.method register(Landroid/net/Uri;Lcom/getcapacitor/WebViewLocalServer$PathHandler;)V
    .locals 4

    iget-object v0, p0, Lcom/getcapacitor/WebViewLocalServer;->uriMatcher:Lcom/getcapacitor/UriMatcher;

    .line 571
    monitor-enter v0

    :try_start_0
    iget-object v1, p0, Lcom/getcapacitor/WebViewLocalServer;->uriMatcher:Lcom/getcapacitor/UriMatcher;

    .line 572
    invoke-virtual {p1}, Landroid/net/Uri;->getScheme()Ljava/lang/String;

    move-result-object v2

    invoke-virtual {p1}, Landroid/net/Uri;->getAuthority()Ljava/lang/String;

    move-result-object v3

    invoke-virtual {p1}, Landroid/net/Uri;->getPath()Ljava/lang/String;

    move-result-object p1

    invoke-virtual {v1, v2, v3, p1, p2}, Lcom/getcapacitor/UriMatcher;->addURI(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/Object;)V

    .line 573
    monitor-exit v0

    return-void

    :catchall_0
    move-exception p1

    monitor-exit v0
    :try_end_0
    .catchall {:try_start_0 .. :try_end_0} :catchall_0

    throw p1
.end method

.method public shouldInterceptRequest(Landroid/webkit/WebResourceRequest;)Landroid/webkit/WebResourceResponse;
    .locals 5

    .line 172
    invoke-interface {p1}, Landroid/webkit/WebResourceRequest;->getUrl()Landroid/net/Uri;

    move-result-object v0

    .line 174
    invoke-virtual {v0}, Landroid/net/Uri;->getPath()Ljava/lang/String;

    move-result-object v1

    const/4 v2, 0x0

    if-eqz v1, :cond_0

    invoke-virtual {v0}, Landroid/net/Uri;->getPath()Ljava/lang/String;

    move-result-object v1

    const-string v3, "/_capacitor_http_interceptor_"

    invoke-virtual {v1, v3}, Ljava/lang/String;->startsWith(Ljava/lang/String;)Z

    move-result v1

    if-eqz v1, :cond_0

    .line 175
    new-instance v1, Ljava/lang/StringBuilder;

    const-string v3, "Handling CapacitorHttp request: "

    invoke-direct {v1, v3}, Ljava/lang/StringBuilder;-><init>(Ljava/lang/String;)V

    invoke-virtual {v1, v0}, Ljava/lang/StringBuilder;->append(Ljava/lang/Object;)Ljava/lang/StringBuilder;

    invoke-virtual {v1}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object v0

    invoke-static {v0}, Lcom/getcapacitor/Logger;->debug(Ljava/lang/String;)V

    .line 177
    :try_start_0
    invoke-direct {p0, p1}, Lcom/getcapacitor/WebViewLocalServer;->handleCapacitorHttpRequest(Landroid/webkit/WebResourceRequest;)Landroid/webkit/WebResourceResponse;

    move-result-object p1
    :try_end_0
    .catch Ljava/lang/Exception; {:try_start_0 .. :try_end_0} :catch_0

    return-object p1

    :catch_0
    move-exception p1

    .line 179
    invoke-virtual {p1}, Ljava/lang/Exception;->getLocalizedMessage()Ljava/lang/String;

    move-result-object p1

    invoke-static {p1}, Lcom/getcapacitor/Logger;->error(Ljava/lang/String;)V

    return-object v2

    :cond_0
    iget-object v1, p0, Lcom/getcapacitor/WebViewLocalServer;->uriMatcher:Lcom/getcapacitor/UriMatcher;

    .line 185
    monitor-enter v1

    :try_start_1
    iget-object v3, p0, Lcom/getcapacitor/WebViewLocalServer;->uriMatcher:Lcom/getcapacitor/UriMatcher;

    .line 186
    invoke-interface {p1}, Landroid/webkit/WebResourceRequest;->getUrl()Landroid/net/Uri;

    move-result-object v4

    invoke-virtual {v3, v4}, Lcom/getcapacitor/UriMatcher;->match(Landroid/net/Uri;)Ljava/lang/Object;

    move-result-object v3

    check-cast v3, Lcom/getcapacitor/WebViewLocalServer$PathHandler;

    .line 187
    monitor-exit v1
    :try_end_1
    .catchall {:try_start_1 .. :try_end_1} :catchall_0

    if-nez v3, :cond_1

    return-object v2

    .line 192
    :cond_1
    invoke-direct {p0, v0}, Lcom/getcapacitor/WebViewLocalServer;->isLocalFile(Landroid/net/Uri;)Z

    move-result v1

    if-nez v1, :cond_3

    invoke-direct {p0, v0}, Lcom/getcapacitor/WebViewLocalServer;->isMainUrl(Landroid/net/Uri;)Z

    move-result v1

    if-nez v1, :cond_3

    invoke-direct {p0, v0}, Lcom/getcapacitor/WebViewLocalServer;->isAllowedUrl(Landroid/net/Uri;)Z

    move-result v1

    if-eqz v1, :cond_3

    invoke-direct {p0, v0}, Lcom/getcapacitor/WebViewLocalServer;->isErrorUrl(Landroid/net/Uri;)Z

    move-result v0

    if-eqz v0, :cond_2

    goto :goto_0

    .line 196
    :cond_2
    invoke-direct {p0, p1, v3}, Lcom/getcapacitor/WebViewLocalServer;->handleProxyRequest(Landroid/webkit/WebResourceRequest;Lcom/getcapacitor/WebViewLocalServer$PathHandler;)Landroid/webkit/WebResourceResponse;

    move-result-object p1

    return-object p1

    .line 193
    :cond_3
    :goto_0
    new-instance v0, Ljava/lang/StringBuilder;

    const-string v1, "Handling local request: "

    invoke-direct {v0, v1}, Ljava/lang/StringBuilder;-><init>(Ljava/lang/String;)V

    invoke-interface {p1}, Landroid/webkit/WebResourceRequest;->getUrl()Landroid/net/Uri;

    move-result-object v1

    invoke-virtual {v1}, Landroid/net/Uri;->toString()Ljava/lang/String;

    move-result-object v1

    invoke-virtual {v0, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v0}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object v0

    invoke-static {v0}, Lcom/getcapacitor/Logger;->debug(Ljava/lang/String;)V

    .line 194
    invoke-direct {p0, p1, v3}, Lcom/getcapacitor/WebViewLocalServer;->handleLocalRequest(Landroid/webkit/WebResourceRequest;Lcom/getcapacitor/WebViewLocalServer$PathHandler;)Landroid/webkit/WebResourceResponse;

    move-result-object p1

    return-object p1

    :catchall_0
    move-exception p1

    .line 187
    :try_start_2
    monitor-exit v1
    :try_end_2
    .catchall {:try_start_2 .. :try_end_2} :catchall_0

    throw p1
.end method
