.class public Lcom/getcapacitor/plugin/util/CapacitorHttpUrlConnection;
.super Ljava/lang/Object;
.source "CapacitorHttpUrlConnection.java"

# interfaces
.implements Lcom/getcapacitor/plugin/util/ICapacitorHttpUrlConnection;


# instance fields
.field private final connection:Ljava/net/HttpURLConnection;


# direct methods
.method public constructor <init>(Ljava/net/HttpURLConnection;)V
    .locals 0

    .line 42
    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    iput-object p1, p0, Lcom/getcapacitor/plugin/util/CapacitorHttpUrlConnection;->connection:Ljava/net/HttpURLConnection;

    .line 44
    invoke-direct {p0}, Lcom/getcapacitor/plugin/util/CapacitorHttpUrlConnection;->setDefaultRequestProperties()V

    return-void
.end method

.method private buildDefaultAcceptLanguageProperty()Ljava/lang/String;
    .locals 5

    sget v0, Landroid/os/Build$VERSION;->SDK_INT:I

    const/16 v1, 0x18

    const/4 v2, 0x0

    if-lt v0, v1, :cond_0

    .line 447
    invoke-static {}, Lcom/getcapacitor/Bridge$$ExternalSyntheticApiModelOutline0;->m()Landroid/os/LocaleList;

    move-result-object v0

    invoke-static {v0, v2}, Lcom/getcapacitor/Bridge$$ExternalSyntheticApiModelOutline0;->m(Landroid/os/LocaleList;I)Ljava/util/Locale;

    move-result-object v0

    goto :goto_0

    .line 449
    :cond_0
    invoke-static {}, Ljava/util/Locale;->getDefault()Ljava/util/Locale;

    move-result-object v0

    .line 452
    :goto_0
    invoke-virtual {v0}, Ljava/util/Locale;->getLanguage()Ljava/lang/String;

    move-result-object v1

    .line 453
    invoke-virtual {v0}, Ljava/util/Locale;->getCountry()Ljava/lang/String;

    move-result-object v0

    .line 454
    invoke-static {v1}, Landroid/text/TextUtils;->isEmpty(Ljava/lang/CharSequence;)Z

    move-result v3

    if-nez v3, :cond_2

    .line 455
    invoke-static {v0}, Landroid/text/TextUtils;->isEmpty(Ljava/lang/CharSequence;)Z

    move-result v3

    const/4 v4, 0x1

    if-nez v3, :cond_1

    const/4 v3, 0x3

    new-array v3, v3, [Ljava/lang/Object;

    aput-object v1, v3, v2

    aput-object v0, v3, v4

    const/4 v0, 0x2

    aput-object v1, v3, v0

    const-string v0, "%s-%s,%s;q=0.5"

    .line 456
    invoke-static {v0, v3}, Ljava/lang/String;->format(Ljava/lang/String;[Ljava/lang/Object;)Ljava/lang/String;

    move-result-object v0

    goto :goto_1

    :cond_1
    new-array v0, v4, [Ljava/lang/Object;

    aput-object v1, v0, v2

    const-string v1, "%s;q=0.5"

    .line 458
    invoke-static {v1, v0}, Ljava/lang/String;->format(Ljava/lang/String;[Ljava/lang/Object;)Ljava/lang/String;

    move-result-object v0

    goto :goto_1

    :cond_2
    const-string v0, ""

    :goto_1
    return-object v0
.end method

.method private setDefaultRequestProperties()V
    .locals 3

    .line 435
    invoke-direct {p0}, Lcom/getcapacitor/plugin/util/CapacitorHttpUrlConnection;->buildDefaultAcceptLanguageProperty()Ljava/lang/String;

    move-result-object v0

    .line 436
    invoke-static {v0}, Landroid/text/TextUtils;->isEmpty(Ljava/lang/CharSequence;)Z

    move-result v1

    if-nez v1, :cond_0

    iget-object v1, p0, Lcom/getcapacitor/plugin/util/CapacitorHttpUrlConnection;->connection:Ljava/net/HttpURLConnection;

    const-string v2, "Accept-Language"

    .line 437
    invoke-virtual {v1, v2, v0}, Ljava/net/HttpURLConnection;->setRequestProperty(Ljava/lang/String;Ljava/lang/String;)V

    :cond_0
    return-void
.end method

.method private writeFormDataRequestBody(Ljava/lang/String;Lcom/getcapacitor/JSArray;)V
    .locals 10
    .annotation system Ldalvik/annotation/Throws;
        value = {
            Ljava/io/IOException;,
            Lorg/json/JSONException;
        }
    .end annotation

    .line 264
    new-instance v0, Ljava/io/DataOutputStream;

    iget-object v1, p0, Lcom/getcapacitor/plugin/util/CapacitorHttpUrlConnection;->connection:Ljava/net/HttpURLConnection;

    invoke-virtual {v1}, Ljava/net/HttpURLConnection;->getOutputStream()Ljava/io/OutputStream;

    move-result-object v1

    invoke-direct {v0, v1}, Ljava/io/DataOutputStream;-><init>(Ljava/io/OutputStream;)V

    :try_start_0
    const-string v1, ";"

    .line 265
    invoke-virtual {p1, v1}, Ljava/lang/String;->split(Ljava/lang/String;)[Ljava/lang/String;

    move-result-object p1

    const/4 v1, 0x1

    aget-object p1, p1, v1

    const-string v2, "="

    invoke-virtual {p1, v2}, Ljava/lang/String;->split(Ljava/lang/String;)[Ljava/lang/String;

    move-result-object p1

    aget-object p1, p1, v1

    const-string v1, "\r\n"

    const-string v2, "--"

    .line 269
    invoke-virtual {p2}, Lcom/getcapacitor/JSArray;->toList()Ljava/util/List;

    move-result-object p2

    invoke-interface {p2}, Ljava/util/List;->iterator()Ljava/util/Iterator;

    move-result-object p2

    :cond_0
    :goto_0
    invoke-interface {p2}, Ljava/util/Iterator;->hasNext()Z

    move-result v3

    if-eqz v3, :cond_3

    invoke-interface {p2}, Ljava/util/Iterator;->next()Ljava/lang/Object;

    move-result-object v3

    .line 270
    instance-of v4, v3, Lorg/json/JSONObject;

    if-eqz v4, :cond_0

    .line 271
    check-cast v3, Lorg/json/JSONObject;

    const-string v4, "type"

    .line 272
    invoke-virtual {v3, v4}, Lorg/json/JSONObject;->getString(Ljava/lang/String;)Ljava/lang/String;

    move-result-object v4

    const-string v5, "key"

    .line 273
    invoke-virtual {v3, v5}, Lorg/json/JSONObject;->getString(Ljava/lang/String;)Ljava/lang/String;

    move-result-object v5

    const-string v6, "value"

    .line 274
    invoke-virtual {v3, v6}, Lorg/json/JSONObject;->getString(Ljava/lang/String;)Ljava/lang/String;

    move-result-object v6

    const-string v7, "string"

    .line 275
    invoke-virtual {v4, v7}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v7
    :try_end_0
    .catchall {:try_start_0 .. :try_end_0} :catchall_0

    const-string v8, "\""

    const-string v9, "Content-Disposition: form-data; name=\""

    if-eqz v7, :cond_1

    .line 276
    :try_start_1
    new-instance v3, Ljava/lang/StringBuilder;

    invoke-direct {v3}, Ljava/lang/StringBuilder;-><init>()V

    invoke-virtual {v3, v2}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v3, p1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v3, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v3}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object v3

    invoke-virtual {v0, v3}, Ljava/io/DataOutputStream;->writeBytes(Ljava/lang/String;)V

    .line 277
    new-instance v3, Ljava/lang/StringBuilder;

    invoke-direct {v3}, Ljava/lang/StringBuilder;-><init>()V

    invoke-virtual {v3, v9}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v3, v5}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v3, v8}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v3, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v3, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v3}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object v3

    invoke-virtual {v0, v3}, Ljava/io/DataOutputStream;->writeBytes(Ljava/lang/String;)V

    .line 278
    sget-object v3, Ljava/nio/charset/StandardCharsets;->UTF_8:Ljava/nio/charset/Charset;

    invoke-virtual {v6, v3}, Ljava/lang/String;->getBytes(Ljava/nio/charset/Charset;)[B

    move-result-object v3

    invoke-virtual {v0, v3}, Ljava/io/DataOutputStream;->write([B)V

    .line 279
    invoke-virtual {v0, v1}, Ljava/io/DataOutputStream;->writeBytes(Ljava/lang/String;)V

    goto :goto_0

    :cond_1
    const-string v7, "base64File"

    .line 280
    invoke-virtual {v4, v7}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v4

    if-eqz v4, :cond_0

    const-string v4, "fileName"

    .line 281
    invoke-virtual {v3, v4}, Lorg/json/JSONObject;->getString(Ljava/lang/String;)Ljava/lang/String;

    move-result-object v4

    const-string v7, "contentType"

    .line 282
    invoke-virtual {v3, v7}, Lorg/json/JSONObject;->getString(Ljava/lang/String;)Ljava/lang/String;

    move-result-object v3

    .line 284
    new-instance v7, Ljava/lang/StringBuilder;

    invoke-direct {v7}, Ljava/lang/StringBuilder;-><init>()V

    invoke-virtual {v7, v2}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v7, p1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v7, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v7}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object v7

    invoke-virtual {v0, v7}, Ljava/io/DataOutputStream;->writeBytes(Ljava/lang/String;)V

    .line 285
    new-instance v7, Ljava/lang/StringBuilder;

    invoke-direct {v7}, Ljava/lang/StringBuilder;-><init>()V

    invoke-virtual {v7, v9}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v7, v5}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    const-string v5, "\"; filename=\""

    invoke-virtual {v7, v5}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v7, v4}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v7, v8}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v7, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v7}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object v4

    invoke-virtual {v0, v4}, Ljava/io/DataOutputStream;->writeBytes(Ljava/lang/String;)V

    .line 286
    new-instance v4, Ljava/lang/StringBuilder;

    invoke-direct {v4}, Ljava/lang/StringBuilder;-><init>()V

    const-string v5, "Content-Type: "

    invoke-virtual {v4, v5}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v4, v3}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v4, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v4}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object v3

    invoke-virtual {v0, v3}, Ljava/io/DataOutputStream;->writeBytes(Ljava/lang/String;)V

    .line 287
    new-instance v3, Ljava/lang/StringBuilder;

    invoke-direct {v3}, Ljava/lang/StringBuilder;-><init>()V

    const-string v4, "Content-Transfer-Encoding: binary"

    invoke-virtual {v3, v4}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v3, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v3}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object v3

    invoke-virtual {v0, v3}, Ljava/io/DataOutputStream;->writeBytes(Ljava/lang/String;)V

    .line 288
    invoke-virtual {v0, v1}, Ljava/io/DataOutputStream;->writeBytes(Ljava/lang/String;)V

    sget v3, Landroid/os/Build$VERSION;->SDK_INT:I

    const/16 v4, 0x1a

    if-lt v3, v4, :cond_2

    .line 291
    invoke-static {}, Lcom/getcapacitor/Bridge$$ExternalSyntheticApiModelOutline0;->m()Ljava/util/Base64$Decoder;

    move-result-object v3

    invoke-static {v3, v6}, Lcom/getcapacitor/Bridge$$ExternalSyntheticApiModelOutline0;->m(Ljava/util/Base64$Decoder;Ljava/lang/String;)[B

    move-result-object v3

    invoke-virtual {v0, v3}, Ljava/io/DataOutputStream;->write([B)V

    goto :goto_1

    :cond_2
    const/4 v3, 0x0

    .line 293
    invoke-static {v6, v3}, Landroid/util/Base64;->decode(Ljava/lang/String;I)[B

    move-result-object v3

    invoke-virtual {v0, v3}, Ljava/io/DataOutputStream;->write([B)V

    .line 296
    :goto_1
    invoke-virtual {v0, v1}, Ljava/io/DataOutputStream;->writeBytes(Ljava/lang/String;)V

    goto/16 :goto_0

    .line 301
    :cond_3
    new-instance p2, Ljava/lang/StringBuilder;

    invoke-direct {p2}, Ljava/lang/StringBuilder;-><init>()V

    invoke-virtual {p2, v2}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {p2, p1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {p2, v2}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {p2, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {p2}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object p1

    invoke-virtual {v0, p1}, Ljava/io/DataOutputStream;->writeBytes(Ljava/lang/String;)V

    .line 302
    invoke-virtual {v0}, Ljava/io/DataOutputStream;->flush()V
    :try_end_1
    .catchall {:try_start_1 .. :try_end_1} :catchall_0

    .line 303
    invoke-virtual {v0}, Ljava/io/DataOutputStream;->close()V

    return-void

    :catchall_0
    move-exception p1

    .line 264
    :try_start_2
    invoke-virtual {v0}, Ljava/io/DataOutputStream;->close()V
    :try_end_2
    .catchall {:try_start_2 .. :try_end_2} :catchall_1

    goto :goto_2

    :catchall_1
    move-exception p2

    invoke-virtual {p1, p2}, Ljava/lang/Throwable;->addSuppressed(Ljava/lang/Throwable;)V

    :goto_2
    throw p1
.end method

.method private writeObjectRequestBody(Lcom/getcapacitor/JSObject;)V
    .locals 4
    .annotation system Ldalvik/annotation/Throws;
        value = {
            Ljava/io/IOException;,
            Lorg/json/JSONException;
        }
    .end annotation

    .line 246
    new-instance v0, Ljava/io/DataOutputStream;

    iget-object v1, p0, Lcom/getcapacitor/plugin/util/CapacitorHttpUrlConnection;->connection:Ljava/net/HttpURLConnection;

    invoke-virtual {v1}, Ljava/net/HttpURLConnection;->getOutputStream()Ljava/io/OutputStream;

    move-result-object v1

    invoke-direct {v0, v1}, Ljava/io/DataOutputStream;-><init>(Ljava/io/OutputStream;)V

    .line 247
    :try_start_0
    invoke-virtual {p1}, Lcom/getcapacitor/JSObject;->keys()Ljava/util/Iterator;

    move-result-object v1

    .line 248
    :cond_0
    :goto_0
    invoke-interface {v1}, Ljava/util/Iterator;->hasNext()Z

    move-result v2

    if-eqz v2, :cond_1

    .line 249
    invoke-interface {v1}, Ljava/util/Iterator;->next()Ljava/lang/Object;

    move-result-object v2

    check-cast v2, Ljava/lang/String;

    .line 250
    invoke-virtual {p1, v2}, Lcom/getcapacitor/JSObject;->get(Ljava/lang/String;)Ljava/lang/Object;

    move-result-object v3

    .line 251
    invoke-virtual {v0, v2}, Ljava/io/DataOutputStream;->writeBytes(Ljava/lang/String;)V

    const-string v2, "="

    .line 252
    invoke-virtual {v0, v2}, Ljava/io/DataOutputStream;->writeBytes(Ljava/lang/String;)V

    .line 253
    invoke-virtual {v3}, Ljava/lang/Object;->toString()Ljava/lang/String;

    move-result-object v2

    const-string v3, "UTF-8"

    invoke-static {v2, v3}, Ljava/net/URLEncoder;->encode(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;

    move-result-object v2

    invoke-virtual {v0, v2}, Ljava/io/DataOutputStream;->writeBytes(Ljava/lang/String;)V

    .line 255
    invoke-interface {v1}, Ljava/util/Iterator;->hasNext()Z

    move-result v2

    if-eqz v2, :cond_0

    const-string v2, "&"

    .line 256
    invoke-virtual {v0, v2}, Ljava/io/DataOutputStream;->writeBytes(Ljava/lang/String;)V

    goto :goto_0

    .line 259
    :cond_1
    invoke-virtual {v0}, Ljava/io/DataOutputStream;->flush()V
    :try_end_0
    .catchall {:try_start_0 .. :try_end_0} :catchall_0

    .line 260
    invoke-virtual {v0}, Ljava/io/DataOutputStream;->close()V

    return-void

    :catchall_0
    move-exception p1

    .line 246
    :try_start_1
    invoke-virtual {v0}, Ljava/io/DataOutputStream;->close()V
    :try_end_1
    .catchall {:try_start_1 .. :try_end_1} :catchall_1

    goto :goto_1

    :catchall_1
    move-exception v0

    invoke-virtual {p1, v0}, Ljava/lang/Throwable;->addSuppressed(Ljava/lang/Throwable;)V

    :goto_1
    throw p1
.end method

.method private writeRequestBody(Ljava/lang/String;)V
    .locals 2
    .annotation system Ldalvik/annotation/Throws;
        value = {
            Ljava/io/IOException;
        }
    .end annotation

    .line 239
    new-instance v0, Ljava/io/DataOutputStream;

    iget-object v1, p0, Lcom/getcapacitor/plugin/util/CapacitorHttpUrlConnection;->connection:Ljava/net/HttpURLConnection;

    invoke-virtual {v1}, Ljava/net/HttpURLConnection;->getOutputStream()Ljava/io/OutputStream;

    move-result-object v1

    invoke-direct {v0, v1}, Ljava/io/DataOutputStream;-><init>(Ljava/io/OutputStream;)V

    .line 240
    :try_start_0
    sget-object v1, Ljava/nio/charset/StandardCharsets;->UTF_8:Ljava/nio/charset/Charset;

    invoke-virtual {p1, v1}, Ljava/lang/String;->getBytes(Ljava/nio/charset/Charset;)[B

    move-result-object p1

    invoke-virtual {v0, p1}, Ljava/io/DataOutputStream;->write([B)V

    .line 241
    invoke-virtual {v0}, Ljava/io/DataOutputStream;->flush()V
    :try_end_0
    .catchall {:try_start_0 .. :try_end_0} :catchall_0

    .line 242
    invoke-virtual {v0}, Ljava/io/DataOutputStream;->close()V

    return-void

    :catchall_0
    move-exception p1

    .line 239
    :try_start_1
    invoke-virtual {v0}, Ljava/io/DataOutputStream;->close()V
    :try_end_1
    .catchall {:try_start_1 .. :try_end_1} :catchall_1

    goto :goto_0

    :catchall_1
    move-exception v0

    invoke-virtual {p1, v0}, Ljava/lang/Throwable;->addSuppressed(Ljava/lang/Throwable;)V

    :goto_0
    throw p1
.end method


# virtual methods
.method public connect()V
    .locals 1
    .annotation system Ldalvik/annotation/Throws;
        value = {
            Ljava/io/IOException;
        }
    .end annotation

    iget-object v0, p0, Lcom/getcapacitor/plugin/util/CapacitorHttpUrlConnection;->connection:Ljava/net/HttpURLConnection;

    .line 328
    invoke-virtual {v0}, Ljava/net/HttpURLConnection;->connect()V

    return-void
.end method

.method public disconnect()V
    .locals 1

    iget-object v0, p0, Lcom/getcapacitor/plugin/util/CapacitorHttpUrlConnection;->connection:Ljava/net/HttpURLConnection;

    .line 56
    invoke-virtual {v0}, Ljava/net/HttpURLConnection;->disconnect()V

    return-void
.end method

.method public getErrorStream()Ljava/io/InputStream;
    .locals 1

    iget-object v0, p0, Lcom/getcapacitor/plugin/util/CapacitorHttpUrlConnection;->connection:Ljava/net/HttpURLConnection;

    .line 379
    invoke-virtual {v0}, Ljava/net/HttpURLConnection;->getErrorStream()Ljava/io/InputStream;

    move-result-object v0

    return-object v0
.end method

.method public getHeaderField(Ljava/lang/String;)Ljava/lang/String;
    .locals 1

    iget-object v0, p0, Lcom/getcapacitor/plugin/util/CapacitorHttpUrlConnection;->connection:Ljava/net/HttpURLConnection;

    .line 395
    invoke-virtual {v0, p1}, Ljava/net/HttpURLConnection;->getHeaderField(Ljava/lang/String;)Ljava/lang/String;

    move-result-object p1

    return-object p1
.end method

.method public getHeaderFields()Ljava/util/Map;
    .locals 1
    .annotation system Ldalvik/annotation/Signature;
        value = {
            "()",
            "Ljava/util/Map<",
            "Ljava/lang/String;",
            "Ljava/util/List<",
            "Ljava/lang/String;",
            ">;>;"
        }
    .end annotation

    iget-object v0, p0, Lcom/getcapacitor/plugin/util/CapacitorHttpUrlConnection;->connection:Ljava/net/HttpURLConnection;

    .line 427
    invoke-virtual {v0}, Ljava/net/HttpURLConnection;->getHeaderFields()Ljava/util/Map;

    move-result-object v0

    return-object v0
.end method

.method public getHttpConnection()Ljava/net/HttpURLConnection;
    .locals 1

    iget-object v0, p0, Lcom/getcapacitor/plugin/util/CapacitorHttpUrlConnection;->connection:Ljava/net/HttpURLConnection;

    return-object v0
.end method

.method public getInputStream()Ljava/io/InputStream;
    .locals 1
    .annotation system Ldalvik/annotation/Throws;
        value = {
            Ljava/io/IOException;
        }
    .end annotation

    iget-object v0, p0, Lcom/getcapacitor/plugin/util/CapacitorHttpUrlConnection;->connection:Ljava/net/HttpURLConnection;

    .line 414
    invoke-virtual {v0}, Ljava/net/HttpURLConnection;->getInputStream()Ljava/io/InputStream;

    move-result-object v0

    return-object v0
.end method

.method public getResponseCode()I
    .locals 1
    .annotation system Ldalvik/annotation/Throws;
        value = {
            Ljava/io/IOException;
        }
    .end annotation

    iget-object v0, p0, Lcom/getcapacitor/plugin/util/CapacitorHttpUrlConnection;->connection:Ljava/net/HttpURLConnection;

    .line 345
    invoke-virtual {v0}, Ljava/net/HttpURLConnection;->getResponseCode()I

    move-result v0

    return v0
.end method

.method public getURL()Ljava/net/URL;
    .locals 1

    iget-object v0, p0, Lcom/getcapacitor/plugin/util/CapacitorHttpUrlConnection;->connection:Ljava/net/HttpURLConnection;

    .line 356
    invoke-virtual {v0}, Ljava/net/HttpURLConnection;->getURL()Ljava/net/URL;

    move-result-object v0

    return-object v0
.end method

.method public setAllowUserInteraction(Z)V
    .locals 1

    iget-object v0, p0, Lcom/getcapacitor/plugin/util/CapacitorHttpUrlConnection;->connection:Ljava/net/HttpURLConnection;

    .line 67
    invoke-virtual {v0, p1}, Ljava/net/HttpURLConnection;->setAllowUserInteraction(Z)V

    return-void
.end method

.method public setConnectTimeout(I)V
    .locals 1

    if-ltz p1, :cond_0

    iget-object v0, p0, Lcom/getcapacitor/plugin/util/CapacitorHttpUrlConnection;->connection:Ljava/net/HttpURLConnection;

    .line 118
    invoke-virtual {v0, p1}, Ljava/net/HttpURLConnection;->setConnectTimeout(I)V

    return-void

    .line 116
    :cond_0
    new-instance p1, Ljava/lang/IllegalArgumentException;

    const-string v0, "timeout can not be negative"

    invoke-direct {p1, v0}, Ljava/lang/IllegalArgumentException;-><init>(Ljava/lang/String;)V

    throw p1
.end method

.method public setDisableRedirects(Z)V
    .locals 1

    iget-object v0, p0, Lcom/getcapacitor/plugin/util/CapacitorHttpUrlConnection;->connection:Ljava/net/HttpURLConnection;

    xor-int/lit8 p1, p1, 0x1

    .line 145
    invoke-virtual {v0, p1}, Ljava/net/HttpURLConnection;->setInstanceFollowRedirects(Z)V

    return-void
.end method

.method public setDoOutput(Z)V
    .locals 1

    iget-object v0, p0, Lcom/getcapacitor/plugin/util/CapacitorHttpUrlConnection;->connection:Ljava/net/HttpURLConnection;

    .line 173
    invoke-virtual {v0, p1}, Ljava/net/HttpURLConnection;->setDoOutput(Z)V

    return-void
.end method

.method public setReadTimeout(I)V
    .locals 1

    if-ltz p1, :cond_0

    iget-object v0, p0, Lcom/getcapacitor/plugin/util/CapacitorHttpUrlConnection;->connection:Ljava/net/HttpURLConnection;

    .line 137
    invoke-virtual {v0, p1}, Ljava/net/HttpURLConnection;->setReadTimeout(I)V

    return-void

    .line 135
    :cond_0
    new-instance p1, Ljava/lang/IllegalArgumentException;

    const-string v0, "timeout can not be negative"

    invoke-direct {p1, v0}, Ljava/lang/IllegalArgumentException;-><init>(Ljava/lang/String;)V

    throw p1
.end method

.method public setRequestBody(Lcom/getcapacitor/PluginCall;Lcom/getcapacitor/JSValue;)V
    .locals 1
    .annotation system Ldalvik/annotation/Throws;
        value = {
            Lorg/json/JSONException;,
            Ljava/io/IOException;
        }
    .end annotation

    const/4 v0, 0x0

    .line 183
    invoke-virtual {p0, p1, p2, v0}, Lcom/getcapacitor/plugin/util/CapacitorHttpUrlConnection;->setRequestBody(Lcom/getcapacitor/PluginCall;Lcom/getcapacitor/JSValue;Ljava/lang/String;)V

    return-void
.end method

.method public setRequestBody(Lcom/getcapacitor/PluginCall;Lcom/getcapacitor/JSValue;Ljava/lang/String;)V
    .locals 3
    .annotation system Ldalvik/annotation/Throws;
        value = {
            Lorg/json/JSONException;,
            Ljava/io/IOException;
        }
    .end annotation

    iget-object v0, p0, Lcom/getcapacitor/plugin/util/CapacitorHttpUrlConnection;->connection:Ljava/net/HttpURLConnection;

    const-string v1, "Content-Type"

    .line 193
    invoke-virtual {v0, v1}, Ljava/net/HttpURLConnection;->getRequestProperty(Ljava/lang/String;)Ljava/lang/String;

    move-result-object v0

    if-eqz v0, :cond_a

    .line 196
    invoke-virtual {v0}, Ljava/lang/String;->isEmpty()Z

    move-result v1

    if-eqz v1, :cond_0

    goto/16 :goto_3

    :cond_0
    const-string v1, "application/json"

    .line 198
    invoke-virtual {v0, v1}, Ljava/lang/String;->contains(Ljava/lang/CharSequence;)Z

    move-result v1

    if-eqz v1, :cond_5

    const-string p3, "data"

    const/4 v0, 0x0

    const-string v1, ""

    if-eqz p2, :cond_1

    .line 201
    invoke-virtual {p2}, Lcom/getcapacitor/JSValue;->toString()Ljava/lang/String;

    move-result-object v2

    goto :goto_0

    .line 203
    :cond_1
    invoke-virtual {p1, p3, v0}, Lcom/getcapacitor/PluginCall;->getArray(Ljava/lang/String;Lcom/getcapacitor/JSArray;)Lcom/getcapacitor/JSArray;

    move-result-object v0

    move-object v2, v1

    :goto_0
    if-eqz v0, :cond_2

    .line 206
    invoke-virtual {v0}, Lcom/getcapacitor/JSArray;->toString()Ljava/lang/String;

    move-result-object v2

    goto :goto_1

    :cond_2
    if-nez p2, :cond_3

    .line 208
    invoke-virtual {p1, p3}, Lcom/getcapacitor/PluginCall;->getString(Ljava/lang/String;)Ljava/lang/String;

    move-result-object v2

    :cond_3
    :goto_1
    if-eqz v2, :cond_4

    move-object v1, v2

    .line 210
    :cond_4
    invoke-direct {p0, v1}, Lcom/getcapacitor/plugin/util/CapacitorHttpUrlConnection;->writeRequestBody(Ljava/lang/String;)V

    goto :goto_3

    :cond_5
    if-eqz p3, :cond_7

    const-string p1, "file"

    .line 211
    invoke-virtual {p3, p1}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result p1

    if-eqz p1, :cond_7

    .line 212
    new-instance p1, Ljava/io/DataOutputStream;

    iget-object p3, p0, Lcom/getcapacitor/plugin/util/CapacitorHttpUrlConnection;->connection:Ljava/net/HttpURLConnection;

    invoke-virtual {p3}, Ljava/net/HttpURLConnection;->getOutputStream()Ljava/io/OutputStream;

    move-result-object p3

    invoke-direct {p1, p3}, Ljava/io/DataOutputStream;-><init>(Ljava/io/OutputStream;)V

    :try_start_0
    sget p3, Landroid/os/Build$VERSION;->SDK_INT:I

    const/16 v0, 0x1a

    if-lt p3, v0, :cond_6

    .line 214
    invoke-static {}, Lcom/getcapacitor/Bridge$$ExternalSyntheticApiModelOutline0;->m()Ljava/util/Base64$Decoder;

    move-result-object p3

    invoke-virtual {p2}, Lcom/getcapacitor/JSValue;->toString()Ljava/lang/String;

    move-result-object p2

    invoke-static {p3, p2}, Lcom/getcapacitor/Bridge$$ExternalSyntheticApiModelOutline0;->m(Ljava/util/Base64$Decoder;Ljava/lang/String;)[B

    move-result-object p2

    invoke-virtual {p1, p2}, Ljava/io/DataOutputStream;->write([B)V

    .line 216
    :cond_6
    invoke-virtual {p1}, Ljava/io/DataOutputStream;->flush()V
    :try_end_0
    .catchall {:try_start_0 .. :try_end_0} :catchall_0

    .line 217
    invoke-virtual {p1}, Ljava/io/DataOutputStream;->close()V

    goto :goto_3

    :catchall_0
    move-exception p2

    .line 212
    :try_start_1
    invoke-virtual {p1}, Ljava/io/DataOutputStream;->close()V
    :try_end_1
    .catchall {:try_start_1 .. :try_end_1} :catchall_1

    goto :goto_2

    :catchall_1
    move-exception p1

    invoke-virtual {p2, p1}, Ljava/lang/Throwable;->addSuppressed(Ljava/lang/Throwable;)V

    :goto_2
    throw p2

    :cond_7
    const-string p1, "application/x-www-form-urlencoded"

    .line 218
    invoke-virtual {v0, p1}, Ljava/lang/String;->contains(Ljava/lang/CharSequence;)Z

    move-result p1

    if-eqz p1, :cond_8

    .line 220
    :try_start_2
    invoke-virtual {p2}, Lcom/getcapacitor/JSValue;->toJSObject()Lcom/getcapacitor/JSObject;

    move-result-object p1

    .line 221
    invoke-direct {p0, p1}, Lcom/getcapacitor/plugin/util/CapacitorHttpUrlConnection;->writeObjectRequestBody(Lcom/getcapacitor/JSObject;)V
    :try_end_2
    .catch Ljava/lang/Exception; {:try_start_2 .. :try_end_2} :catch_0

    goto :goto_3

    .line 224
    :catch_0
    invoke-virtual {p2}, Lcom/getcapacitor/JSValue;->toString()Ljava/lang/String;

    move-result-object p1

    invoke-direct {p0, p1}, Lcom/getcapacitor/plugin/util/CapacitorHttpUrlConnection;->writeRequestBody(Ljava/lang/String;)V

    goto :goto_3

    :cond_8
    if-eqz p3, :cond_9

    const-string p1, "formData"

    .line 226
    invoke-virtual {p3, p1}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result p1

    if-eqz p1, :cond_9

    .line 227
    invoke-virtual {p2}, Lcom/getcapacitor/JSValue;->toJSArray()Lcom/getcapacitor/JSArray;

    move-result-object p1

    invoke-direct {p0, v0, p1}, Lcom/getcapacitor/plugin/util/CapacitorHttpUrlConnection;->writeFormDataRequestBody(Ljava/lang/String;Lcom/getcapacitor/JSArray;)V

    goto :goto_3

    .line 229
    :cond_9
    invoke-virtual {p2}, Lcom/getcapacitor/JSValue;->toString()Ljava/lang/String;

    move-result-object p1

    invoke-direct {p0, p1}, Lcom/getcapacitor/plugin/util/CapacitorHttpUrlConnection;->writeRequestBody(Ljava/lang/String;)V

    :cond_a
    :goto_3
    return-void
.end method

.method public setRequestHeaders(Lcom/getcapacitor/JSObject;)V
    .locals 4

    .line 153
    invoke-virtual {p1}, Lcom/getcapacitor/JSObject;->keys()Ljava/util/Iterator;

    move-result-object v0

    .line 154
    :goto_0
    invoke-interface {v0}, Ljava/util/Iterator;->hasNext()Z

    move-result v1

    if-eqz v1, :cond_0

    .line 155
    invoke-interface {v0}, Ljava/util/Iterator;->next()Ljava/lang/Object;

    move-result-object v1

    check-cast v1, Ljava/lang/String;

    .line 156
    invoke-virtual {p1, v1}, Lcom/getcapacitor/JSObject;->getString(Ljava/lang/String;)Ljava/lang/String;

    move-result-object v2

    iget-object v3, p0, Lcom/getcapacitor/plugin/util/CapacitorHttpUrlConnection;->connection:Ljava/net/HttpURLConnection;

    .line 157
    invoke-virtual {v3, v1, v2}, Ljava/net/HttpURLConnection;->setRequestProperty(Ljava/lang/String;Ljava/lang/String;)V

    goto :goto_0

    :cond_0
    return-void
.end method

.method public setRequestMethod(Ljava/lang/String;)V
    .locals 1
    .annotation system Ldalvik/annotation/Throws;
        value = {
            Ljava/net/ProtocolException;
        }
    .end annotation

    iget-object v0, p0, Lcom/getcapacitor/plugin/util/CapacitorHttpUrlConnection;->connection:Ljava/net/HttpURLConnection;

    .line 91
    invoke-virtual {v0, p1}, Ljava/net/HttpURLConnection;->setRequestMethod(Ljava/lang/String;)V

    return-void
.end method

.method public setSSLSocketFactory(Lcom/getcapacitor/Bridge;)V
    .locals 6

    :try_start_0
    const-string v0, "io.ionic.sslpinning.SSLPinning"

    .line 467
    invoke-static {v0}, Ljava/lang/Class;->forName(Ljava/lang/String;)Ljava/lang/Class;

    move-result-object v0

    const-string v1, "getSSLSocketFactory"

    const/4 v2, 0x1

    new-array v3, v2, [Ljava/lang/Class;

    .line 468
    const-class v4, Lcom/getcapacitor/Bridge;

    const/4 v5, 0x0

    aput-object v4, v3, v5

    invoke-virtual {v0, v1, v3}, Ljava/lang/Class;->getDeclaredMethod(Ljava/lang/String;[Ljava/lang/Class;)Ljava/lang/reflect/Method;

    move-result-object v1

    new-array v3, v5, [Ljava/lang/Class;

    .line 470
    invoke-virtual {v0, v3}, Ljava/lang/Class;->getDeclaredConstructor([Ljava/lang/Class;)Ljava/lang/reflect/Constructor;

    move-result-object v0

    new-array v3, v5, [Ljava/lang/Object;

    invoke-virtual {v0, v3}, Ljava/lang/reflect/Constructor;->newInstance([Ljava/lang/Object;)Ljava/lang/Object;

    move-result-object v0

    new-array v2, v2, [Ljava/lang/Object;

    aput-object p1, v2, v5

    .line 469
    invoke-virtual {v1, v0, v2}, Ljava/lang/reflect/Method;->invoke(Ljava/lang/Object;[Ljava/lang/Object;)Ljava/lang/Object;

    move-result-object p1

    check-cast p1, Ljavax/net/ssl/SSLSocketFactory;

    if-eqz p1, :cond_0

    iget-object v0, p0, Lcom/getcapacitor/plugin/util/CapacitorHttpUrlConnection;->connection:Ljava/net/HttpURLConnection;

    .line 474
    check-cast v0, Ljavax/net/ssl/HttpsURLConnection;

    invoke-virtual {v0, p1}, Ljavax/net/ssl/HttpsURLConnection;->setSSLSocketFactory(Ljavax/net/ssl/SSLSocketFactory;)V
    :try_end_0
    .catch Ljava/lang/Exception; {:try_start_0 .. :try_end_0} :catch_0

    :catch_0
    :cond_0
    return-void
.end method
