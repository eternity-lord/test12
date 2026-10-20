.class public Lcom/getcapacitor/BridgeActivity;
.super Landroidx/appcompat/app/AppCompatActivity;
.source "BridgeActivity.java"


# instance fields
.field protected activityDepth:I

.field protected bridge:Lcom/getcapacitor/Bridge;

.field protected final bridgeBuilder:Lcom/getcapacitor/Bridge$Builder;

.field protected config:Lcom/getcapacitor/CapConfig;

.field protected initialPlugins:Ljava/util/List;
    .annotation system Ldalvik/annotation/Signature;
        value = {
            "Ljava/util/List<",
            "Ljava/lang/Class<",
            "+",
            "Lcom/getcapacitor/Plugin;",
            ">;>;"
        }
    .end annotation
.end field

.field protected keepRunning:Z


# direct methods
.method public constructor <init>()V
    .locals 1

    .line 11
    invoke-direct {p0}, Landroidx/appcompat/app/AppCompatActivity;-><init>()V

    const/4 v0, 0x1

    iput-boolean v0, p0, Lcom/getcapacitor/BridgeActivity;->keepRunning:Z

    const/4 v0, 0x0

    iput v0, p0, Lcom/getcapacitor/BridgeActivity;->activityDepth:I

    .line 18
    new-instance v0, Ljava/util/ArrayList;

    invoke-direct {v0}, Ljava/util/ArrayList;-><init>()V

    iput-object v0, p0, Lcom/getcapacitor/BridgeActivity;->initialPlugins:Ljava/util/List;

    .line 19
    new-instance v0, Lcom/getcapacitor/Bridge$Builder;

    invoke-direct {v0, p0}, Lcom/getcapacitor/Bridge$Builder;-><init>(Landroidx/appcompat/app/AppCompatActivity;)V

    iput-object v0, p0, Lcom/getcapacitor/BridgeActivity;->bridgeBuilder:Lcom/getcapacitor/Bridge$Builder;

    return-void
.end method


# virtual methods
.method public getBridge()Lcom/getcapacitor/Bridge;
    .locals 1

    iget-object v0, p0, Lcom/getcapacitor/BridgeActivity;->bridge:Lcom/getcapacitor/Bridge;

    return-object v0
.end method

.method protected load()V
    .locals 2

    const-string v0, "Starting BridgeActivity"

    .line 46
    invoke-static {v0}, Lcom/getcapacitor/Logger;->debug(Ljava/lang/String;)V

    iget-object v0, p0, Lcom/getcapacitor/BridgeActivity;->bridgeBuilder:Lcom/getcapacitor/Bridge$Builder;

    iget-object v1, p0, Lcom/getcapacitor/BridgeActivity;->initialPlugins:Ljava/util/List;

    .line 48
    invoke-virtual {v0, v1}, Lcom/getcapacitor/Bridge$Builder;->addPlugins(Ljava/util/List;)Lcom/getcapacitor/Bridge$Builder;

    move-result-object v0

    iget-object v1, p0, Lcom/getcapacitor/BridgeActivity;->config:Lcom/getcapacitor/CapConfig;

    invoke-virtual {v0, v1}, Lcom/getcapacitor/Bridge$Builder;->setConfig(Lcom/getcapacitor/CapConfig;)Lcom/getcapacitor/Bridge$Builder;

    move-result-object v0

    invoke-virtual {v0}, Lcom/getcapacitor/Bridge$Builder;->create()Lcom/getcapacitor/Bridge;

    move-result-object v0

    iput-object v0, p0, Lcom/getcapacitor/BridgeActivity;->bridge:Lcom/getcapacitor/Bridge;

    .line 50
    invoke-virtual {v0}, Lcom/getcapacitor/Bridge;->shouldKeepRunning()Z

    move-result v0

    iput-boolean v0, p0, Lcom/getcapacitor/BridgeActivity;->keepRunning:Z

    .line 51
    invoke-virtual {p0}, Lcom/getcapacitor/BridgeActivity;->getIntent()Landroid/content/Intent;

    move-result-object v0

    invoke-virtual {p0, v0}, Lcom/getcapacitor/BridgeActivity;->onNewIntent(Landroid/content/Intent;)V

    return-void
.end method

.method protected onActivityResult(IILandroid/content/Intent;)V
    .locals 1

    iget-object v0, p0, Lcom/getcapacitor/BridgeActivity;->bridge:Lcom/getcapacitor/Bridge;

    if-nez v0, :cond_0

    return-void

    .line 186
    :cond_0
    invoke-virtual {v0, p1, p2, p3}, Lcom/getcapacitor/Bridge;->onActivityResult(IILandroid/content/Intent;)Z

    move-result v0

    if-nez v0, :cond_1

    .line 187
    invoke-super {p0, p1, p2, p3}, Landroidx/appcompat/app/AppCompatActivity;->onActivityResult(IILandroid/content/Intent;)V

    :cond_1
    return-void
.end method

.method public onConfigurationChanged(Landroid/content/res/Configuration;)V
    .locals 1

    .line 204
    invoke-super {p0, p1}, Landroidx/appcompat/app/AppCompatActivity;->onConfigurationChanged(Landroid/content/res/Configuration;)V

    iget-object v0, p0, Lcom/getcapacitor/BridgeActivity;->bridge:Lcom/getcapacitor/Bridge;

    if-nez v0, :cond_0

    return-void

    .line 210
    :cond_0
    invoke-virtual {v0, p1}, Lcom/getcapacitor/Bridge;->onConfigurationChanged(Landroid/content/res/Configuration;)V

    return-void
.end method

.method protected onCreate(Landroid/os/Bundle;)V
    .locals 1

    .line 23
    invoke-super {p0, p1}, Landroidx/appcompat/app/AppCompatActivity;->onCreate(Landroid/os/Bundle;)V

    iget-object v0, p0, Lcom/getcapacitor/BridgeActivity;->bridgeBuilder:Lcom/getcapacitor/Bridge$Builder;

    .line 24
    invoke-virtual {v0, p1}, Lcom/getcapacitor/Bridge$Builder;->setInstanceState(Landroid/os/Bundle;)Lcom/getcapacitor/Bridge$Builder;

    .line 25
    invoke-virtual {p0}, Lcom/getcapacitor/BridgeActivity;->getApplication()Landroid/app/Application;

    move-result-object p1

    sget v0, Lcom/getcapacitor/android/R$style;->AppTheme_NoActionBar:I

    invoke-virtual {p1, v0}, Landroid/app/Application;->setTheme(I)V

    .line 26
    sget p1, Lcom/getcapacitor/android/R$style;->AppTheme_NoActionBar:I

    invoke-virtual {p0, p1}, Lcom/getcapacitor/BridgeActivity;->setTheme(I)V

    .line 28
    :try_start_0
    sget p1, Lcom/getcapacitor/android/R$layout;->bridge_layout_main:I

    invoke-virtual {p0, p1}, Lcom/getcapacitor/BridgeActivity;->setContentView(I)V
    :try_end_0
    .catch Ljava/lang/Exception; {:try_start_0 .. :try_end_0} :catch_1

    .line 34
    new-instance p1, Lcom/getcapacitor/PluginManager;

    invoke-virtual {p0}, Lcom/getcapacitor/BridgeActivity;->getAssets()Landroid/content/res/AssetManager;

    move-result-object v0

    invoke-direct {p1, v0}, Lcom/getcapacitor/PluginManager;-><init>(Landroid/content/res/AssetManager;)V

    :try_start_1
    iget-object v0, p0, Lcom/getcapacitor/BridgeActivity;->bridgeBuilder:Lcom/getcapacitor/Bridge$Builder;

    .line 37
    invoke-virtual {p1}, Lcom/getcapacitor/PluginManager;->loadPluginClasses()Ljava/util/List;

    move-result-object p1

    invoke-virtual {v0, p1}, Lcom/getcapacitor/Bridge$Builder;->addPlugins(Ljava/util/List;)Lcom/getcapacitor/Bridge$Builder;
    :try_end_1
    .catch Lcom/getcapacitor/PluginLoadException; {:try_start_1 .. :try_end_1} :catch_0

    goto :goto_0

    :catch_0
    move-exception p1

    const-string v0, "Error loading plugins."

    .line 39
    invoke-static {v0, p1}, Lcom/getcapacitor/Logger;->error(Ljava/lang/String;Ljava/lang/Throwable;)V

    .line 42
    :goto_0
    invoke-virtual {p0}, Lcom/getcapacitor/BridgeActivity;->load()V

    return-void

    .line 30
    :catch_1
    sget p1, Lcom/getcapacitor/android/R$layout;->no_webview:I

    invoke-virtual {p0, p1}, Lcom/getcapacitor/BridgeActivity;->setContentView(I)V

    return-void
.end method

.method public onDestroy()V
    .locals 1

    .line 124
    invoke-super {p0}, Landroidx/appcompat/app/AppCompatActivity;->onDestroy()V

    iget-object v0, p0, Lcom/getcapacitor/BridgeActivity;->bridge:Lcom/getcapacitor/Bridge;

    if-eqz v0, :cond_0

    .line 126
    invoke-virtual {v0}, Lcom/getcapacitor/Bridge;->onDestroy()V

    const-string v0, "App destroyed"

    .line 127
    invoke-static {v0}, Lcom/getcapacitor/Logger;->debug(Ljava/lang/String;)V

    :cond_0
    return-void
.end method

.method public onDetachedFromWindow()V
    .locals 1

    .line 133
    invoke-super {p0}, Landroidx/appcompat/app/AppCompatActivity;->onDetachedFromWindow()V

    iget-object v0, p0, Lcom/getcapacitor/BridgeActivity;->bridge:Lcom/getcapacitor/Bridge;

    .line 134
    invoke-virtual {v0}, Lcom/getcapacitor/Bridge;->onDetachedFromWindow()V

    return-void
.end method

.method protected onNewIntent(Landroid/content/Intent;)V
    .locals 1

    .line 193
    invoke-super {p0, p1}, Landroidx/appcompat/app/AppCompatActivity;->onNewIntent(Landroid/content/Intent;)V

    iget-object v0, p0, Lcom/getcapacitor/BridgeActivity;->bridge:Lcom/getcapacitor/Bridge;

    if-eqz v0, :cond_1

    if-nez p1, :cond_0

    goto :goto_0

    .line 199
    :cond_0
    invoke-virtual {v0, p1}, Lcom/getcapacitor/Bridge;->onNewIntent(Landroid/content/Intent;)V

    :cond_1
    :goto_0
    return-void
.end method

.method public onPause()V
    .locals 1

    .line 101
    invoke-super {p0}, Landroidx/appcompat/app/AppCompatActivity;->onPause()V

    iget-object v0, p0, Lcom/getcapacitor/BridgeActivity;->bridge:Lcom/getcapacitor/Bridge;

    if-eqz v0, :cond_0

    .line 103
    invoke-virtual {v0}, Lcom/getcapacitor/Bridge;->onPause()V

    const-string v0, "App paused"

    .line 104
    invoke-static {v0}, Lcom/getcapacitor/Logger;->debug(Ljava/lang/String;)V

    :cond_0
    return-void
.end method

.method public onRequestPermissionsResult(I[Ljava/lang/String;[I)V
    .locals 1

    iget-object v0, p0, Lcom/getcapacitor/BridgeActivity;->bridge:Lcom/getcapacitor/Bridge;

    if-nez v0, :cond_0

    return-void

    .line 159
    :cond_0
    invoke-virtual {v0, p1, p2, p3}, Lcom/getcapacitor/Bridge;->onRequestPermissionsResult(I[Ljava/lang/String;[I)Z

    move-result v0

    if-nez v0, :cond_1

    .line 160
    invoke-super {p0, p1, p2, p3}, Landroidx/appcompat/app/AppCompatActivity;->onRequestPermissionsResult(I[Ljava/lang/String;[I)V

    :cond_1
    return-void
.end method

.method public onRestart()V
    .locals 1

    .line 84
    invoke-super {p0}, Landroidx/appcompat/app/AppCompatActivity;->onRestart()V

    iget-object v0, p0, Lcom/getcapacitor/BridgeActivity;->bridge:Lcom/getcapacitor/Bridge;

    .line 85
    invoke-virtual {v0}, Lcom/getcapacitor/Bridge;->onRestart()V

    const-string v0, "App restarted"

    .line 86
    invoke-static {v0}, Lcom/getcapacitor/Logger;->debug(Ljava/lang/String;)V

    return-void
.end method

.method public onResume()V
    .locals 2

    .line 91
    invoke-super {p0}, Landroidx/appcompat/app/AppCompatActivity;->onResume()V

    iget-object v0, p0, Lcom/getcapacitor/BridgeActivity;->bridge:Lcom/getcapacitor/Bridge;

    if-eqz v0, :cond_0

    .line 93
    invoke-virtual {v0}, Lcom/getcapacitor/Bridge;->getApp()Lcom/getcapacitor/App;

    move-result-object v0

    const/4 v1, 0x1

    invoke-virtual {v0, v1}, Lcom/getcapacitor/App;->fireStatusChange(Z)V

    iget-object v0, p0, Lcom/getcapacitor/BridgeActivity;->bridge:Lcom/getcapacitor/Bridge;

    .line 94
    invoke-virtual {v0}, Lcom/getcapacitor/Bridge;->onResume()V

    const-string v0, "App resumed"

    .line 95
    invoke-static {v0}, Lcom/getcapacitor/Logger;->debug(Ljava/lang/String;)V

    :cond_0
    return-void
.end method

.method public onSaveInstanceState(Landroid/os/Bundle;)V
    .locals 1

    .line 68
    invoke-super {p0, p1}, Landroidx/appcompat/app/AppCompatActivity;->onSaveInstanceState(Landroid/os/Bundle;)V

    iget-object v0, p0, Lcom/getcapacitor/BridgeActivity;->bridge:Lcom/getcapacitor/Bridge;

    .line 69
    invoke-virtual {v0, p1}, Lcom/getcapacitor/Bridge;->saveInstanceState(Landroid/os/Bundle;)V

    return-void
.end method

.method public onStart()V
    .locals 1

    .line 74
    invoke-super {p0}, Landroidx/appcompat/app/AppCompatActivity;->onStart()V

    iget v0, p0, Lcom/getcapacitor/BridgeActivity;->activityDepth:I

    add-int/lit8 v0, v0, 0x1

    iput v0, p0, Lcom/getcapacitor/BridgeActivity;->activityDepth:I

    iget-object v0, p0, Lcom/getcapacitor/BridgeActivity;->bridge:Lcom/getcapacitor/Bridge;

    if-eqz v0, :cond_0

    .line 77
    invoke-virtual {v0}, Lcom/getcapacitor/Bridge;->onStart()V

    const-string v0, "App started"

    .line 78
    invoke-static {v0}, Lcom/getcapacitor/Logger;->debug(Ljava/lang/String;)V

    :cond_0
    return-void
.end method

.method public onStop()V
    .locals 2

    .line 110
    invoke-super {p0}, Landroidx/appcompat/app/AppCompatActivity;->onStop()V

    iget-object v0, p0, Lcom/getcapacitor/BridgeActivity;->bridge:Lcom/getcapacitor/Bridge;

    if-eqz v0, :cond_1

    iget v0, p0, Lcom/getcapacitor/BridgeActivity;->activityDepth:I

    add-int/lit8 v0, v0, -0x1

    const/4 v1, 0x0

    .line 112
    invoke-static {v1, v0}, Ljava/lang/Math;->max(II)I

    move-result v0

    iput v0, p0, Lcom/getcapacitor/BridgeActivity;->activityDepth:I

    if-nez v0, :cond_0

    iget-object v0, p0, Lcom/getcapacitor/BridgeActivity;->bridge:Lcom/getcapacitor/Bridge;

    .line 114
    invoke-virtual {v0}, Lcom/getcapacitor/Bridge;->getApp()Lcom/getcapacitor/App;

    move-result-object v0

    invoke-virtual {v0, v1}, Lcom/getcapacitor/App;->fireStatusChange(Z)V

    :cond_0
    iget-object v0, p0, Lcom/getcapacitor/BridgeActivity;->bridge:Lcom/getcapacitor/Bridge;

    .line 117
    invoke-virtual {v0}, Lcom/getcapacitor/Bridge;->onStop()V

    const-string v0, "App stopped"

    .line 118
    invoke-static {v0}, Lcom/getcapacitor/Logger;->debug(Ljava/lang/String;)V

    :cond_1
    return-void
.end method

.method public registerPlugin(Ljava/lang/Class;)V
    .locals 1
    .annotation system Ldalvik/annotation/Signature;
        value = {
            "(",
            "Ljava/lang/Class<",
            "+",
            "Lcom/getcapacitor/Plugin;",
            ">;)V"
        }
    .end annotation

    iget-object v0, p0, Lcom/getcapacitor/BridgeActivity;->bridgeBuilder:Lcom/getcapacitor/Bridge$Builder;

    .line 55
    invoke-virtual {v0, p1}, Lcom/getcapacitor/Bridge$Builder;->addPlugin(Ljava/lang/Class;)Lcom/getcapacitor/Bridge$Builder;

    return-void
.end method

.method public registerPlugins(Ljava/util/List;)V
    .locals 1
    .annotation system Ldalvik/annotation/Signature;
        value = {
            "(",
            "Ljava/util/List<",
            "Ljava/lang/Class<",
            "+",
            "Lcom/getcapacitor/Plugin;",
            ">;>;)V"
        }
    .end annotation

    iget-object v0, p0, Lcom/getcapacitor/BridgeActivity;->bridgeBuilder:Lcom/getcapacitor/Bridge$Builder;

    .line 59
    invoke-virtual {v0, p1}, Lcom/getcapacitor/Bridge$Builder;->addPlugins(Ljava/util/List;)Lcom/getcapacitor/Bridge$Builder;

    return-void
.end method
