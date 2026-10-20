.class public Lcom/getcapacitor/PluginResult;
.super Ljava/lang/Object;
.source "PluginResult.java"


# instance fields
.field private final json:Lcom/getcapacitor/JSObject;


# direct methods
.method public constructor <init>()V
    .locals 1

    .line 16
    new-instance v0, Lcom/getcapacitor/JSObject;

    invoke-direct {v0}, Lcom/getcapacitor/JSObject;-><init>()V

    invoke-direct {p0, v0}, Lcom/getcapacitor/PluginResult;-><init>(Lcom/getcapacitor/JSObject;)V

    return-void
.end method

.method public constructor <init>(Lcom/getcapacitor/JSObject;)V
    .locals 0

    .line 19
    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    iput-object p1, p0, Lcom/getcapacitor/PluginResult;->json:Lcom/getcapacitor/JSObject;

    return-void
.end method


# virtual methods
.method public getWrappedResult()Lcom/getcapacitor/JSObject;
    .locals 4

    .line 76
    new-instance v0, Lcom/getcapacitor/JSObject;

    invoke-direct {v0}, Lcom/getcapacitor/JSObject;-><init>()V

    iget-object v1, p0, Lcom/getcapacitor/PluginResult;->json:Lcom/getcapacitor/JSObject;

    const-string v2, "pluginId"

    .line 77
    invoke-virtual {v1, v2}, Lcom/getcapacitor/JSObject;->getString(Ljava/lang/String;)Ljava/lang/String;

    move-result-object v1

    invoke-virtual {v0, v2, v1}, Lcom/getcapacitor/JSObject;->put(Ljava/lang/String;Ljava/lang/String;)Lcom/getcapacitor/JSObject;

    iget-object v1, p0, Lcom/getcapacitor/PluginResult;->json:Lcom/getcapacitor/JSObject;

    const-string v2, "methodName"

    .line 78
    invoke-virtual {v1, v2}, Lcom/getcapacitor/JSObject;->getString(Ljava/lang/String;)Ljava/lang/String;

    move-result-object v1

    invoke-virtual {v0, v2, v1}, Lcom/getcapacitor/JSObject;->put(Ljava/lang/String;Ljava/lang/String;)Lcom/getcapacitor/JSObject;

    iget-object v1, p0, Lcom/getcapacitor/PluginResult;->json:Lcom/getcapacitor/JSObject;

    const/4 v2, 0x0

    .line 79
    invoke-static {v2}, Ljava/lang/Boolean;->valueOf(Z)Ljava/lang/Boolean;

    move-result-object v2

    const-string v3, "success"

    invoke-virtual {v1, v3, v2}, Lcom/getcapacitor/JSObject;->getBoolean(Ljava/lang/String;Ljava/lang/Boolean;)Ljava/lang/Boolean;

    move-result-object v1

    invoke-virtual {v0, v3, v1}, Lcom/getcapacitor/JSObject;->put(Ljava/lang/String;Ljava/lang/Object;)Lcom/getcapacitor/JSObject;

    iget-object v1, p0, Lcom/getcapacitor/PluginResult;->json:Lcom/getcapacitor/JSObject;

    const-string v2, "data"

    .line 80
    invoke-virtual {v1, v2}, Lcom/getcapacitor/JSObject;->getJSObject(Ljava/lang/String;)Lcom/getcapacitor/JSObject;

    move-result-object v1

    invoke-virtual {v0, v2, v1}, Lcom/getcapacitor/JSObject;->put(Ljava/lang/String;Ljava/lang/Object;)Lcom/getcapacitor/JSObject;

    iget-object v1, p0, Lcom/getcapacitor/PluginResult;->json:Lcom/getcapacitor/JSObject;

    const-string v2, "error"

    .line 81
    invoke-virtual {v1, v2}, Lcom/getcapacitor/JSObject;->getJSObject(Ljava/lang/String;)Lcom/getcapacitor/JSObject;

    move-result-object v1

    invoke-virtual {v0, v2, v1}, Lcom/getcapacitor/JSObject;->put(Ljava/lang/String;Ljava/lang/Object;)Lcom/getcapacitor/JSObject;

    return-object v0
.end method

.method jsonPut(Ljava/lang/String;Ljava/lang/Object;)Lcom/getcapacitor/PluginResult;
    .locals 1

    :try_start_0
    iget-object v0, p0, Lcom/getcapacitor/PluginResult;->json:Lcom/getcapacitor/JSObject;

    .line 59
    invoke-virtual {v0, p1, p2}, Lcom/getcapacitor/JSObject;->put(Ljava/lang/String;Ljava/lang/Object;)Lcom/getcapacitor/JSObject;
    :try_end_0
    .catch Ljava/lang/Exception; {:try_start_0 .. :try_end_0} :catch_0

    goto :goto_0

    :catch_0
    move-exception p1

    const-string p2, "Plugin"

    .line 61
    filled-new-array {p2}, [Ljava/lang/String;

    move-result-object p2

    invoke-static {p2}, Lcom/getcapacitor/Logger;->tags([Ljava/lang/String;)Ljava/lang/String;

    move-result-object p2

    const-string v0, ""

    invoke-static {p2, v0, p1}, Lcom/getcapacitor/Logger;->error(Ljava/lang/String;Ljava/lang/String;Ljava/lang/Throwable;)V

    :goto_0
    return-object p0
.end method

.method public put(Ljava/lang/String;D)Lcom/getcapacitor/PluginResult;
    .locals 0

    .line 28
    invoke-static {p2, p3}, Ljava/lang/Double;->valueOf(D)Ljava/lang/Double;

    move-result-object p2

    invoke-virtual {p0, p1, p2}, Lcom/getcapacitor/PluginResult;->jsonPut(Ljava/lang/String;Ljava/lang/Object;)Lcom/getcapacitor/PluginResult;

    move-result-object p1

    return-object p1
.end method

.method public put(Ljava/lang/String;I)Lcom/getcapacitor/PluginResult;
    .locals 0

    .line 32
    invoke-static {p2}, Ljava/lang/Integer;->valueOf(I)Ljava/lang/Integer;

    move-result-object p2

    invoke-virtual {p0, p1, p2}, Lcom/getcapacitor/PluginResult;->jsonPut(Ljava/lang/String;Ljava/lang/Object;)Lcom/getcapacitor/PluginResult;

    move-result-object p1

    return-object p1
.end method

.method public put(Ljava/lang/String;J)Lcom/getcapacitor/PluginResult;
    .locals 0

    .line 36
    invoke-static {p2, p3}, Ljava/lang/Long;->valueOf(J)Ljava/lang/Long;

    move-result-object p2

    invoke-virtual {p0, p1, p2}, Lcom/getcapacitor/PluginResult;->jsonPut(Ljava/lang/String;Ljava/lang/Object;)Lcom/getcapacitor/PluginResult;

    move-result-object p1

    return-object p1
.end method

.method public put(Ljava/lang/String;Lcom/getcapacitor/PluginResult;)Lcom/getcapacitor/PluginResult;
    .locals 0

    .line 54
    iget-object p2, p2, Lcom/getcapacitor/PluginResult;->json:Lcom/getcapacitor/JSObject;

    invoke-virtual {p0, p1, p2}, Lcom/getcapacitor/PluginResult;->jsonPut(Ljava/lang/String;Ljava/lang/Object;)Lcom/getcapacitor/PluginResult;

    move-result-object p1

    return-object p1
.end method

.method public put(Ljava/lang/String;Ljava/lang/Object;)Lcom/getcapacitor/PluginResult;
    .locals 0

    .line 50
    invoke-virtual {p0, p1, p2}, Lcom/getcapacitor/PluginResult;->jsonPut(Ljava/lang/String;Ljava/lang/Object;)Lcom/getcapacitor/PluginResult;

    move-result-object p1

    return-object p1
.end method

.method public put(Ljava/lang/String;Ljava/util/Date;)Lcom/getcapacitor/PluginResult;
    .locals 3

    const-string v0, "UTC"

    .line 43
    invoke-static {v0}, Ljava/util/TimeZone;->getTimeZone(Ljava/lang/String;)Ljava/util/TimeZone;

    move-result-object v0

    .line 44
    new-instance v1, Ljava/text/SimpleDateFormat;

    const-string v2, "yyyy-MM-dd\'T\'HH:mm\'Z\'"

    invoke-direct {v1, v2}, Ljava/text/SimpleDateFormat;-><init>(Ljava/lang/String;)V

    .line 45
    invoke-virtual {v1, v0}, Ljava/text/DateFormat;->setTimeZone(Ljava/util/TimeZone;)V

    .line 46
    invoke-virtual {v1, p2}, Ljava/text/DateFormat;->format(Ljava/util/Date;)Ljava/lang/String;

    move-result-object p2

    invoke-virtual {p0, p1, p2}, Lcom/getcapacitor/PluginResult;->jsonPut(Ljava/lang/String;Ljava/lang/Object;)Lcom/getcapacitor/PluginResult;

    move-result-object p1

    return-object p1
.end method

.method public put(Ljava/lang/String;Z)Lcom/getcapacitor/PluginResult;
    .locals 0

    .line 24
    invoke-static {p2}, Ljava/lang/Boolean;->valueOf(Z)Ljava/lang/Boolean;

    move-result-object p2

    invoke-virtual {p0, p1, p2}, Lcom/getcapacitor/PluginResult;->jsonPut(Ljava/lang/String;Ljava/lang/Object;)Lcom/getcapacitor/PluginResult;

    move-result-object p1

    return-object p1
.end method

.method public toString()Ljava/lang/String;
    .locals 1

    iget-object v0, p0, Lcom/getcapacitor/PluginResult;->json:Lcom/getcapacitor/JSObject;

    .line 67
    invoke-virtual {v0}, Lcom/getcapacitor/JSObject;->toString()Ljava/lang/String;

    move-result-object v0

    return-object v0
.end method
