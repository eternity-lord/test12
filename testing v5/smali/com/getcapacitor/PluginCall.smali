.class public Lcom/getcapacitor/PluginCall;
.super Ljava/lang/Object;
.source "PluginCall.java"


# annotations
.annotation system Ldalvik/annotation/MemberClasses;
    value = {
        Lcom/getcapacitor/PluginCall$PluginCallDataTypeException;
    }
.end annotation


# static fields
.field public static final CALLBACK_ID_DANGLING:Ljava/lang/String; = "-1"


# instance fields
.field private final callbackId:Ljava/lang/String;

.field private final data:Lcom/getcapacitor/JSObject;

.field private isReleased:Z
    .annotation runtime Ljava/lang/Deprecated;
    .end annotation
.end field

.field private keepAlive:Z

.field private final methodName:Ljava/lang/String;

.field private final msgHandler:Lcom/getcapacitor/MessageHandler;

.field private final pluginId:Ljava/lang/String;


# direct methods
.method public constructor <init>(Lcom/getcapacitor/MessageHandler;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Lcom/getcapacitor/JSObject;)V
    .locals 1

    .line 36
    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    const/4 v0, 0x0

    iput-boolean v0, p0, Lcom/getcapacitor/PluginCall;->keepAlive:Z

    iput-boolean v0, p0, Lcom/getcapacitor/PluginCall;->isReleased:Z

    iput-object p1, p0, Lcom/getcapacitor/PluginCall;->msgHandler:Lcom/getcapacitor/MessageHandler;

    iput-object p2, p0, Lcom/getcapacitor/PluginCall;->pluginId:Ljava/lang/String;

    iput-object p3, p0, Lcom/getcapacitor/PluginCall;->callbackId:Ljava/lang/String;

    iput-object p4, p0, Lcom/getcapacitor/PluginCall;->methodName:Ljava/lang/String;

    iput-object p5, p0, Lcom/getcapacitor/PluginCall;->data:Lcom/getcapacitor/JSObject;

    return-void
.end method


# virtual methods
.method public error(Ljava/lang/String;)V
    .locals 0
    .annotation runtime Ljava/lang/Deprecated;
    .end annotation

    .line 117
    invoke-virtual {p0, p1}, Lcom/getcapacitor/PluginCall;->reject(Ljava/lang/String;)V

    return-void
.end method

.method public error(Ljava/lang/String;Ljava/lang/Exception;)V
    .locals 0
    .annotation runtime Ljava/lang/Deprecated;
    .end annotation

    .line 99
    invoke-virtual {p0, p1, p2}, Lcom/getcapacitor/PluginCall;->reject(Ljava/lang/String;Ljava/lang/Exception;)V

    return-void
.end method

.method public error(Ljava/lang/String;Ljava/lang/String;Ljava/lang/Exception;)V
    .locals 0
    .annotation runtime Ljava/lang/Deprecated;
    .end annotation

    .line 108
    invoke-virtual {p0, p1, p2, p3}, Lcom/getcapacitor/PluginCall;->reject(Ljava/lang/String;Ljava/lang/String;Ljava/lang/Exception;)V

    return-void
.end method

.method public errorCallback(Ljava/lang/String;)V
    .locals 3

    .line 82
    new-instance v0, Lcom/getcapacitor/PluginResult;

    invoke-direct {v0}, Lcom/getcapacitor/PluginResult;-><init>()V

    const/4 v1, 0x0

    :try_start_0
    const-string v2, "message"

    .line 85
    invoke-virtual {v0, v2, p1}, Lcom/getcapacitor/PluginResult;->put(Ljava/lang/String;Ljava/lang/Object;)Lcom/getcapacitor/PluginResult;
    :try_end_0
    .catch Ljava/lang/Exception; {:try_start_0 .. :try_end_0} :catch_0

    goto :goto_0

    :catch_0
    move-exception p1

    const-string v2, "Plugin"

    .line 87
    filled-new-array {v2}, [Ljava/lang/String;

    move-result-object v2

    invoke-static {v2}, Lcom/getcapacitor/Logger;->tags([Ljava/lang/String;)Ljava/lang/String;

    move-result-object v2

    invoke-virtual {p1}, Ljava/lang/Exception;->toString()Ljava/lang/String;

    move-result-object p1

    invoke-static {v2, p1, v1}, Lcom/getcapacitor/Logger;->error(Ljava/lang/String;Ljava/lang/String;Ljava/lang/Throwable;)V

    :goto_0
    iget-object p1, p0, Lcom/getcapacitor/PluginCall;->msgHandler:Lcom/getcapacitor/MessageHandler;

    .line 90
    invoke-virtual {p1, p0, v1, v0}, Lcom/getcapacitor/MessageHandler;->sendResponseMessage(Lcom/getcapacitor/PluginCall;Lcom/getcapacitor/PluginResult;Lcom/getcapacitor/PluginResult;)V

    return-void
.end method

.method public getArray(Ljava/lang/String;)Lcom/getcapacitor/JSArray;
    .locals 1

    const/4 v0, 0x0

    .line 342
    invoke-virtual {p0, p1, v0}, Lcom/getcapacitor/PluginCall;->getArray(Ljava/lang/String;Lcom/getcapacitor/JSArray;)Lcom/getcapacitor/JSArray;

    move-result-object p1

    return-object p1
.end method

.method public getArray(Ljava/lang/String;Lcom/getcapacitor/JSArray;)Lcom/getcapacitor/JSArray;
    .locals 3

    iget-object v0, p0, Lcom/getcapacitor/PluginCall;->data:Lcom/getcapacitor/JSObject;

    .line 353
    invoke-virtual {v0, p1}, Lcom/getcapacitor/JSObject;->opt(Ljava/lang/String;)Ljava/lang/Object;

    move-result-object p1

    if-nez p1, :cond_0

    return-object p2

    .line 358
    :cond_0
    instance-of v0, p1, Lorg/json/JSONArray;

    if-eqz v0, :cond_2

    .line 360
    :try_start_0
    check-cast p1, Lorg/json/JSONArray;

    .line 361
    new-instance v0, Ljava/util/ArrayList;

    invoke-direct {v0}, Ljava/util/ArrayList;-><init>()V

    const/4 v1, 0x0

    .line 362
    :goto_0
    invoke-virtual {p1}, Lorg/json/JSONArray;->length()I

    move-result v2

    if-ge v1, v2, :cond_1

    .line 363
    invoke-virtual {p1, v1}, Lorg/json/JSONArray;->get(I)Ljava/lang/Object;

    move-result-object v2

    invoke-interface {v0, v2}, Ljava/util/List;->add(Ljava/lang/Object;)Z

    add-int/lit8 v1, v1, 0x1

    goto :goto_0

    .line 365
    :cond_1
    new-instance p1, Lcom/getcapacitor/JSArray;

    invoke-interface {v0}, Ljava/util/List;->toArray()[Ljava/lang/Object;

    move-result-object v0

    invoke-direct {p1, v0}, Lcom/getcapacitor/JSArray;-><init>(Ljava/lang/Object;)V
    :try_end_0
    .catch Lorg/json/JSONException; {:try_start_0 .. :try_end_0} :catch_0

    return-object p1

    :catch_0
    :cond_2
    return-object p2
.end method

.method public getBoolean(Ljava/lang/String;)Ljava/lang/Boolean;
    .locals 1

    const/4 v0, 0x0

    .line 304
    invoke-virtual {p0, p1, v0}, Lcom/getcapacitor/PluginCall;->getBoolean(Ljava/lang/String;Ljava/lang/Boolean;)Ljava/lang/Boolean;

    move-result-object p1

    return-object p1
.end method

.method public getBoolean(Ljava/lang/String;Ljava/lang/Boolean;)Ljava/lang/Boolean;
    .locals 1

    iget-object v0, p0, Lcom/getcapacitor/PluginCall;->data:Lcom/getcapacitor/JSObject;

    .line 309
    invoke-virtual {v0, p1}, Lcom/getcapacitor/JSObject;->opt(Ljava/lang/String;)Ljava/lang/Object;

    move-result-object p1

    if-nez p1, :cond_0

    return-object p2

    .line 314
    :cond_0
    instance-of v0, p1, Ljava/lang/Boolean;

    if-eqz v0, :cond_1

    .line 315
    check-cast p1, Ljava/lang/Boolean;

    return-object p1

    :cond_1
    return-object p2
.end method

.method public getCallbackId()Ljava/lang/String;
    .locals 1

    iget-object v0, p0, Lcom/getcapacitor/PluginCall;->callbackId:Ljava/lang/String;

    return-object v0
.end method

.method public getData()Lcom/getcapacitor/JSObject;
    .locals 1

    iget-object v0, p0, Lcom/getcapacitor/PluginCall;->data:Lcom/getcapacitor/JSObject;

    return-object v0
.end method

.method public getDouble(Ljava/lang/String;)Ljava/lang/Double;
    .locals 1

    const/4 v0, 0x0

    .line 280
    invoke-virtual {p0, p1, v0}, Lcom/getcapacitor/PluginCall;->getDouble(Ljava/lang/String;Ljava/lang/Double;)Ljava/lang/Double;

    move-result-object p1

    return-object p1
.end method

.method public getDouble(Ljava/lang/String;Ljava/lang/Double;)Ljava/lang/Double;
    .locals 1

    iget-object v0, p0, Lcom/getcapacitor/PluginCall;->data:Lcom/getcapacitor/JSObject;

    .line 285
    invoke-virtual {v0, p1}, Lcom/getcapacitor/JSObject;->opt(Ljava/lang/String;)Ljava/lang/Object;

    move-result-object p1

    if-nez p1, :cond_0

    return-object p2

    .line 290
    :cond_0
    instance-of v0, p1, Ljava/lang/Double;

    if-eqz v0, :cond_1

    .line 291
    check-cast p1, Ljava/lang/Double;

    return-object p1

    .line 293
    :cond_1
    instance-of v0, p1, Ljava/lang/Float;

    if-eqz v0, :cond_2

    .line 294
    check-cast p1, Ljava/lang/Float;

    invoke-virtual {p1}, Ljava/lang/Float;->doubleValue()D

    move-result-wide p1

    invoke-static {p1, p2}, Ljava/lang/Double;->valueOf(D)Ljava/lang/Double;

    move-result-object p1

    return-object p1

    .line 296
    :cond_2
    instance-of v0, p1, Ljava/lang/Integer;

    if-eqz v0, :cond_3

    .line 297
    check-cast p1, Ljava/lang/Integer;

    invoke-virtual {p1}, Ljava/lang/Integer;->doubleValue()D

    move-result-wide p1

    invoke-static {p1, p2}, Ljava/lang/Double;->valueOf(D)Ljava/lang/Double;

    move-result-object p1

    return-object p1

    :cond_3
    return-object p2
.end method

.method public getFloat(Ljava/lang/String;)Ljava/lang/Float;
    .locals 1

    const/4 v0, 0x0

    .line 256
    invoke-virtual {p0, p1, v0}, Lcom/getcapacitor/PluginCall;->getFloat(Ljava/lang/String;Ljava/lang/Float;)Ljava/lang/Float;

    move-result-object p1

    return-object p1
.end method

.method public getFloat(Ljava/lang/String;Ljava/lang/Float;)Ljava/lang/Float;
    .locals 1

    iget-object v0, p0, Lcom/getcapacitor/PluginCall;->data:Lcom/getcapacitor/JSObject;

    .line 261
    invoke-virtual {v0, p1}, Lcom/getcapacitor/JSObject;->opt(Ljava/lang/String;)Ljava/lang/Object;

    move-result-object p1

    if-nez p1, :cond_0

    return-object p2

    .line 266
    :cond_0
    instance-of v0, p1, Ljava/lang/Float;

    if-eqz v0, :cond_1

    .line 267
    check-cast p1, Ljava/lang/Float;

    return-object p1

    .line 269
    :cond_1
    instance-of v0, p1, Ljava/lang/Double;

    if-eqz v0, :cond_2

    .line 270
    check-cast p1, Ljava/lang/Double;

    invoke-virtual {p1}, Ljava/lang/Double;->floatValue()F

    move-result p1

    invoke-static {p1}, Ljava/lang/Float;->valueOf(F)Ljava/lang/Float;

    move-result-object p1

    return-object p1

    .line 272
    :cond_2
    instance-of v0, p1, Ljava/lang/Integer;

    if-eqz v0, :cond_3

    .line 273
    check-cast p1, Ljava/lang/Integer;

    invoke-virtual {p1}, Ljava/lang/Integer;->floatValue()F

    move-result p1

    invoke-static {p1}, Ljava/lang/Float;->valueOf(F)Ljava/lang/Float;

    move-result-object p1

    return-object p1

    :cond_3
    return-object p2
.end method

.method public getInt(Ljava/lang/String;)Ljava/lang/Integer;
    .locals 1

    const/4 v0, 0x0

    .line 220
    invoke-virtual {p0, p1, v0}, Lcom/getcapacitor/PluginCall;->getInt(Ljava/lang/String;Ljava/lang/Integer;)Ljava/lang/Integer;

    move-result-object p1

    return-object p1
.end method

.method public getInt(Ljava/lang/String;Ljava/lang/Integer;)Ljava/lang/Integer;
    .locals 1

    iget-object v0, p0, Lcom/getcapacitor/PluginCall;->data:Lcom/getcapacitor/JSObject;

    .line 225
    invoke-virtual {v0, p1}, Lcom/getcapacitor/JSObject;->opt(Ljava/lang/String;)Ljava/lang/Object;

    move-result-object p1

    if-nez p1, :cond_0

    return-object p2

    .line 230
    :cond_0
    instance-of v0, p1, Ljava/lang/Integer;

    if-eqz v0, :cond_1

    .line 231
    check-cast p1, Ljava/lang/Integer;

    return-object p1

    :cond_1
    return-object p2
.end method

.method public getLong(Ljava/lang/String;)Ljava/lang/Long;
    .locals 1

    const/4 v0, 0x0

    .line 238
    invoke-virtual {p0, p1, v0}, Lcom/getcapacitor/PluginCall;->getLong(Ljava/lang/String;Ljava/lang/Long;)Ljava/lang/Long;

    move-result-object p1

    return-object p1
.end method

.method public getLong(Ljava/lang/String;Ljava/lang/Long;)Ljava/lang/Long;
    .locals 1

    iget-object v0, p0, Lcom/getcapacitor/PluginCall;->data:Lcom/getcapacitor/JSObject;

    .line 243
    invoke-virtual {v0, p1}, Lcom/getcapacitor/JSObject;->opt(Ljava/lang/String;)Ljava/lang/Object;

    move-result-object p1

    if-nez p1, :cond_0

    return-object p2

    .line 248
    :cond_0
    instance-of v0, p1, Ljava/lang/Long;

    if-eqz v0, :cond_1

    .line 249
    check-cast p1, Ljava/lang/Long;

    return-object p1

    :cond_1
    return-object p2
.end method

.method public getMethodName()Ljava/lang/String;
    .locals 1

    iget-object v0, p0, Lcom/getcapacitor/PluginCall;->methodName:Ljava/lang/String;

    return-object v0
.end method

.method public getObject(Ljava/lang/String;)Lcom/getcapacitor/JSObject;
    .locals 1

    const/4 v0, 0x0

    .line 321
    invoke-virtual {p0, p1, v0}, Lcom/getcapacitor/PluginCall;->getObject(Ljava/lang/String;Lcom/getcapacitor/JSObject;)Lcom/getcapacitor/JSObject;

    move-result-object p1

    return-object p1
.end method

.method public getObject(Ljava/lang/String;Lcom/getcapacitor/JSObject;)Lcom/getcapacitor/JSObject;
    .locals 1

    iget-object v0, p0, Lcom/getcapacitor/PluginCall;->data:Lcom/getcapacitor/JSObject;

    .line 326
    invoke-virtual {v0, p1}, Lcom/getcapacitor/JSObject;->opt(Ljava/lang/String;)Ljava/lang/Object;

    move-result-object p1

    if-nez p1, :cond_0

    return-object p2

    .line 331
    :cond_0
    instance-of v0, p1, Lorg/json/JSONObject;

    if-eqz v0, :cond_1

    .line 333
    :try_start_0
    check-cast p1, Lorg/json/JSONObject;

    invoke-static {p1}, Lcom/getcapacitor/JSObject;->fromJSONObject(Lorg/json/JSONObject;)Lcom/getcapacitor/JSObject;

    move-result-object p1
    :try_end_0
    .catch Lorg/json/JSONException; {:try_start_0 .. :try_end_0} :catch_0

    return-object p1

    :catch_0
    :cond_1
    return-object p2
.end method

.method public getPluginId()Ljava/lang/String;
    .locals 1

    iget-object v0, p0, Lcom/getcapacitor/PluginCall;->pluginId:Ljava/lang/String;

    return-object v0
.end method

.method public getString(Ljava/lang/String;)Ljava/lang/String;
    .locals 1

    const/4 v0, 0x0

    .line 202
    invoke-virtual {p0, p1, v0}, Lcom/getcapacitor/PluginCall;->getString(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;

    move-result-object p1

    return-object p1
.end method

.method public getString(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;
    .locals 1

    iget-object v0, p0, Lcom/getcapacitor/PluginCall;->data:Lcom/getcapacitor/JSObject;

    .line 207
    invoke-virtual {v0, p1}, Lcom/getcapacitor/JSObject;->opt(Ljava/lang/String;)Ljava/lang/Object;

    move-result-object p1

    if-nez p1, :cond_0

    return-object p2

    .line 212
    :cond_0
    instance-of v0, p1, Ljava/lang/String;

    if-eqz v0, :cond_1

    .line 213
    check-cast p1, Ljava/lang/String;

    return-object p1

    :cond_1
    return-object p2
.end method

.method public hasOption(Ljava/lang/String;)Z
    .locals 1
    .annotation runtime Ljava/lang/Deprecated;
    .end annotation

    iget-object v0, p0, Lcom/getcapacitor/PluginCall;->data:Lcom/getcapacitor/JSObject;

    .line 381
    invoke-virtual {v0, p1}, Lcom/getcapacitor/JSObject;->has(Ljava/lang/String;)Z

    move-result p1

    return p1
.end method

.method public isKeptAlive()Z
    .locals 1

    iget-boolean v0, p0, Lcom/getcapacitor/PluginCall;->keepAlive:Z

    return v0
.end method

.method public isReleased()Z
    .locals 1
    .annotation runtime Ljava/lang/Deprecated;
    .end annotation

    iget-boolean v0, p0, Lcom/getcapacitor/PluginCall;->isReleased:Z

    return v0
.end method

.method public isSaved()Z
    .locals 1
    .annotation runtime Ljava/lang/Deprecated;
    .end annotation

    .line 418
    invoke-virtual {p0}, Lcom/getcapacitor/PluginCall;->isKeptAlive()Z

    move-result v0

    return v0
.end method

.method public reject(Ljava/lang/String;)V
    .locals 1

    const/4 v0, 0x0

    .line 165
    invoke-virtual {p0, p1, v0, v0, v0}, Lcom/getcapacitor/PluginCall;->reject(Ljava/lang/String;Ljava/lang/String;Ljava/lang/Exception;Lcom/getcapacitor/JSObject;)V

    return-void
.end method

.method public reject(Ljava/lang/String;Lcom/getcapacitor/JSObject;)V
    .locals 1

    const/4 v0, 0x0

    .line 153
    invoke-virtual {p0, p1, v0, v0, p2}, Lcom/getcapacitor/PluginCall;->reject(Ljava/lang/String;Ljava/lang/String;Ljava/lang/Exception;Lcom/getcapacitor/JSObject;)V

    return-void
.end method

.method public reject(Ljava/lang/String;Ljava/lang/Exception;)V
    .locals 1

    const/4 v0, 0x0

    .line 157
    invoke-virtual {p0, p1, v0, p2, v0}, Lcom/getcapacitor/PluginCall;->reject(Ljava/lang/String;Ljava/lang/String;Ljava/lang/Exception;Lcom/getcapacitor/JSObject;)V

    return-void
.end method

.method public reject(Ljava/lang/String;Ljava/lang/Exception;Lcom/getcapacitor/JSObject;)V
    .locals 1

    const/4 v0, 0x0

    .line 141
    invoke-virtual {p0, p1, v0, p2, p3}, Lcom/getcapacitor/PluginCall;->reject(Ljava/lang/String;Ljava/lang/String;Ljava/lang/Exception;Lcom/getcapacitor/JSObject;)V

    return-void
.end method

.method public reject(Ljava/lang/String;Ljava/lang/String;)V
    .locals 1

    const/4 v0, 0x0

    .line 161
    invoke-virtual {p0, p1, p2, v0, v0}, Lcom/getcapacitor/PluginCall;->reject(Ljava/lang/String;Ljava/lang/String;Ljava/lang/Exception;Lcom/getcapacitor/JSObject;)V

    return-void
.end method

.method public reject(Ljava/lang/String;Ljava/lang/String;Lcom/getcapacitor/JSObject;)V
    .locals 1

    const/4 v0, 0x0

    .line 145
    invoke-virtual {p0, p1, p2, v0, p3}, Lcom/getcapacitor/PluginCall;->reject(Ljava/lang/String;Ljava/lang/String;Ljava/lang/Exception;Lcom/getcapacitor/JSObject;)V

    return-void
.end method

.method public reject(Ljava/lang/String;Ljava/lang/String;Ljava/lang/Exception;)V
    .locals 1

    const/4 v0, 0x0

    .line 149
    invoke-virtual {p0, p1, p2, p3, v0}, Lcom/getcapacitor/PluginCall;->reject(Ljava/lang/String;Ljava/lang/String;Ljava/lang/Exception;Lcom/getcapacitor/JSObject;)V

    return-void
.end method

.method public reject(Ljava/lang/String;Ljava/lang/String;Ljava/lang/Exception;Lcom/getcapacitor/JSObject;)V
    .locals 3

    .line 121
    new-instance v0, Lcom/getcapacitor/PluginResult;

    invoke-direct {v0}, Lcom/getcapacitor/PluginResult;-><init>()V

    const-string v1, "Plugin"

    if-eqz p3, :cond_0

    .line 124
    filled-new-array {v1}, [Ljava/lang/String;

    move-result-object v2

    invoke-static {v2}, Lcom/getcapacitor/Logger;->tags([Ljava/lang/String;)Ljava/lang/String;

    move-result-object v2

    invoke-static {v2, p1, p3}, Lcom/getcapacitor/Logger;->error(Ljava/lang/String;Ljava/lang/String;Ljava/lang/Throwable;)V

    :cond_0
    :try_start_0
    const-string p3, "message"

    .line 128
    invoke-virtual {v0, p3, p1}, Lcom/getcapacitor/PluginResult;->put(Ljava/lang/String;Ljava/lang/Object;)Lcom/getcapacitor/PluginResult;

    const-string p1, "code"

    .line 129
    invoke-virtual {v0, p1, p2}, Lcom/getcapacitor/PluginResult;->put(Ljava/lang/String;Ljava/lang/Object;)Lcom/getcapacitor/PluginResult;

    if-eqz p4, :cond_1

    const-string p1, "data"

    .line 131
    invoke-virtual {v0, p1, p4}, Lcom/getcapacitor/PluginResult;->put(Ljava/lang/String;Ljava/lang/Object;)Lcom/getcapacitor/PluginResult;
    :try_end_0
    .catch Ljava/lang/Exception; {:try_start_0 .. :try_end_0} :catch_0

    goto :goto_0

    :catch_0
    move-exception p1

    .line 134
    filled-new-array {v1}, [Ljava/lang/String;

    move-result-object p2

    invoke-static {p2}, Lcom/getcapacitor/Logger;->tags([Ljava/lang/String;)Ljava/lang/String;

    move-result-object p2

    invoke-virtual {p1}, Ljava/lang/Exception;->getMessage()Ljava/lang/String;

    move-result-object p3

    invoke-static {p2, p3, p1}, Lcom/getcapacitor/Logger;->error(Ljava/lang/String;Ljava/lang/String;Ljava/lang/Throwable;)V

    :cond_1
    :goto_0
    iget-object p1, p0, Lcom/getcapacitor/PluginCall;->msgHandler:Lcom/getcapacitor/MessageHandler;

    const/4 p2, 0x0

    .line 137
    invoke-virtual {p1, p0, p2, v0}, Lcom/getcapacitor/MessageHandler;->sendResponseMessage(Lcom/getcapacitor/PluginCall;Lcom/getcapacitor/PluginResult;Lcom/getcapacitor/PluginResult;)V

    return-void
.end method

.method public release(Lcom/getcapacitor/Bridge;)V
    .locals 1

    const/4 v0, 0x0

    iput-boolean v0, p0, Lcom/getcapacitor/PluginCall;->keepAlive:Z

    .line 408
    invoke-virtual {p1, p0}, Lcom/getcapacitor/Bridge;->releaseCall(Lcom/getcapacitor/PluginCall;)V

    const/4 p1, 0x1

    iput-boolean p1, p0, Lcom/getcapacitor/PluginCall;->isReleased:Z

    return-void
.end method

.method public resolve()V
    .locals 2

    iget-object v0, p0, Lcom/getcapacitor/PluginCall;->msgHandler:Lcom/getcapacitor/MessageHandler;

    const/4 v1, 0x0

    .line 78
    invoke-virtual {v0, p0, v1, v1}, Lcom/getcapacitor/MessageHandler;->sendResponseMessage(Lcom/getcapacitor/PluginCall;Lcom/getcapacitor/PluginResult;Lcom/getcapacitor/PluginResult;)V

    return-void
.end method

.method public resolve(Lcom/getcapacitor/JSObject;)V
    .locals 2

    .line 73
    new-instance v0, Lcom/getcapacitor/PluginResult;

    invoke-direct {v0, p1}, Lcom/getcapacitor/PluginResult;-><init>(Lcom/getcapacitor/JSObject;)V

    iget-object p1, p0, Lcom/getcapacitor/PluginCall;->msgHandler:Lcom/getcapacitor/MessageHandler;

    const/4 v1, 0x0

    .line 74
    invoke-virtual {p1, p0, v0, v1}, Lcom/getcapacitor/MessageHandler;->sendResponseMessage(Lcom/getcapacitor/PluginCall;Lcom/getcapacitor/PluginResult;Lcom/getcapacitor/PluginResult;)V

    return-void
.end method

.method public save()V
    .locals 1
    .annotation runtime Ljava/lang/Deprecated;
    .end annotation

    const/4 v0, 0x1

    .line 392
    invoke-static {v0}, Ljava/lang/Boolean;->valueOf(Z)Ljava/lang/Boolean;

    move-result-object v0

    invoke-virtual {p0, v0}, Lcom/getcapacitor/PluginCall;->setKeepAlive(Ljava/lang/Boolean;)V

    return-void
.end method

.method public setKeepAlive(Ljava/lang/Boolean;)V
    .locals 0

    .line 403
    invoke-virtual {p1}, Ljava/lang/Boolean;->booleanValue()Z

    move-result p1

    iput-boolean p1, p0, Lcom/getcapacitor/PluginCall;->keepAlive:Z

    return-void
.end method

.method public success()V
    .locals 1
    .annotation runtime Ljava/lang/Deprecated;
    .end annotation

    .line 69
    new-instance v0, Lcom/getcapacitor/JSObject;

    invoke-direct {v0}, Lcom/getcapacitor/JSObject;-><init>()V

    invoke-virtual {p0, v0}, Lcom/getcapacitor/PluginCall;->resolve(Lcom/getcapacitor/JSObject;)V

    return-void
.end method

.method public success(Lcom/getcapacitor/JSObject;)V
    .locals 2
    .annotation runtime Ljava/lang/Deprecated;
    .end annotation

    .line 59
    new-instance v0, Lcom/getcapacitor/PluginResult;

    invoke-direct {v0, p1}, Lcom/getcapacitor/PluginResult;-><init>(Lcom/getcapacitor/JSObject;)V

    iget-object p1, p0, Lcom/getcapacitor/PluginCall;->msgHandler:Lcom/getcapacitor/MessageHandler;

    const/4 v1, 0x0

    .line 60
    invoke-virtual {p1, p0, v0, v1}, Lcom/getcapacitor/MessageHandler;->sendResponseMessage(Lcom/getcapacitor/PluginCall;Lcom/getcapacitor/PluginResult;Lcom/getcapacitor/PluginResult;)V

    return-void
.end method

.method public successCallback(Lcom/getcapacitor/PluginResult;)V
    .locals 2

    const-string v0, "-1"

    iget-object v1, p0, Lcom/getcapacitor/PluginCall;->callbackId:Ljava/lang/String;

    .line 45
    invoke-virtual {v0, v1}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v0

    if-eqz v0, :cond_0

    return-void

    :cond_0
    iget-object v0, p0, Lcom/getcapacitor/PluginCall;->msgHandler:Lcom/getcapacitor/MessageHandler;

    const/4 v1, 0x0

    .line 50
    invoke-virtual {v0, p0, p1, v1}, Lcom/getcapacitor/MessageHandler;->sendResponseMessage(Lcom/getcapacitor/PluginCall;Lcom/getcapacitor/PluginResult;Lcom/getcapacitor/PluginResult;)V

    return-void
.end method

.method public unavailable()V
    .locals 1

    const-string v0, "not available"

    .line 177
    invoke-virtual {p0, v0}, Lcom/getcapacitor/PluginCall;->unavailable(Ljava/lang/String;)V

    return-void
.end method

.method public unavailable(Ljava/lang/String;)V
    .locals 2

    const-string v0, "UNAVAILABLE"

    const/4 v1, 0x0

    .line 181
    invoke-virtual {p0, p1, v0, v1, v1}, Lcom/getcapacitor/PluginCall;->reject(Ljava/lang/String;Ljava/lang/String;Ljava/lang/Exception;Lcom/getcapacitor/JSObject;)V

    return-void
.end method

.method public unimplemented()V
    .locals 1

    const-string v0, "not implemented"

    .line 169
    invoke-virtual {p0, v0}, Lcom/getcapacitor/PluginCall;->unimplemented(Ljava/lang/String;)V

    return-void
.end method

.method public unimplemented(Ljava/lang/String;)V
    .locals 2

    const-string v0, "UNIMPLEMENTED"

    const/4 v1, 0x0

    .line 173
    invoke-virtual {p0, p1, v0, v1, v1}, Lcom/getcapacitor/PluginCall;->reject(Ljava/lang/String;Ljava/lang/String;Ljava/lang/Exception;Lcom/getcapacitor/JSObject;)V

    return-void
.end method
