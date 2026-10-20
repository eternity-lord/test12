.class public Lcom/getcapacitor/BridgeFragment;
.super Landroidx/fragment/app/Fragment;
.source "BridgeFragment.java"


# static fields
.field private static final ARG_START_DIR:Ljava/lang/String; = "startDir"


# instance fields
.field protected bridge:Lcom/getcapacitor/Bridge;

.field private config:Lcom/getcapacitor/CapConfig;

.field private final initialPlugins:Ljava/util/List;
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

.field private final webViewListeners:Ljava/util/List;
    .annotation system Ldalvik/annotation/Signature;
        value = {
            "Ljava/util/List<",
            "Lcom/getcapacitor/WebViewListener;",
            ">;"
        }
    .end annotation
.end field


# direct methods
.method public constructor <init>()V
    .locals 1

    .line 32
    invoke-direct {p0}, Landroidx/fragment/app/Fragment;-><init>()V

    const/4 v0, 0x1

    iput-boolean v0, p0, Lcom/getcapacitor/BridgeFragment;->keepRunning:Z

    .line 27
    new-instance v0, Ljava/util/ArrayList;

    invoke-direct {v0}, Ljava/util/ArrayList;-><init>()V

    iput-object v0, p0, Lcom/getcapacitor/BridgeFragment;->initialPlugins:Ljava/util/List;

    const/4 v0, 0x0

    iput-object v0, p0, Lcom/getcapacitor/BridgeFragment;->config:Lcom/getcapacitor/CapConfig;

    .line 30
    new-instance v0, Ljava/util/ArrayList;

    invoke-direct {v0}, Ljava/util/ArrayList;-><init>()V

    iput-object v0, p0, Lcom/getcapacitor/BridgeFragment;->webViewListeners:Ljava/util/List;

    return-void
.end method

.method public static newInstance(Ljava/lang/String;)Lcom/getcapacitor/BridgeFragment;
    .locals 3

    .line 44
    new-instance v0, Lcom/getcapacitor/BridgeFragment;

    invoke-direct {v0}, Lcom/getcapacitor/BridgeFragment;-><init>()V

    .line 45
    new-instance v1, Landroid/os/Bundle;

    invoke-direct {v1}, Landroid/os/Bundle;-><init>()V

    const-string v2, "startDir"

    .line 46
    invoke-virtual {v1, v2, p0}, Landroid/os/Bundle;->putString(Ljava/lang/String;Ljava/lang/String;)V

    .line 47
    invoke-virtual {v0, v1}, Lcom/getcapacitor/BridgeFragment;->setArguments(Landroid/os/Bundle;)V

    return-object v0
.end method


# virtual methods
.method public addPlugin(Ljava/lang/Class;)V
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

    iget-object v0, p0, Lcom/getcapacitor/BridgeFragment;->initialPlugins:Ljava/util/List;

    .line 52
    invoke-interface {v0, p1}, Ljava/util/List;->add(Ljava/lang/Object;)Z

    return-void
.end method

.method public addWebViewListener(Lcom/getcapacitor/WebViewListener;)V
    .locals 1

    iget-object v0, p0, Lcom/getcapacitor/BridgeFragment;->webViewListeners:Ljava/util/List;

    .line 64
    invoke-interface {v0, p1}, Ljava/util/List;->add(Ljava/lang/Object;)Z

    return-void
.end method

.method public getBridge()Lcom/getcapacitor/Bridge;
    .locals 1

    iget-object v0, p0, Lcom/getcapacitor/BridgeFragment;->bridge:Lcom/getcapacitor/Bridge;

    return-object v0
.end method

.method protected load(Landroid/os/Bundle;)V
    .locals 2

    const-string v0, "Loading Bridge with BridgeFragment"

    .line 71
    invoke-static {v0}, Lcom/getcapacitor/Logger;->debug(Ljava/lang/String;)V

    .line 73
    invoke-virtual {p0}, Lcom/getcapacitor/BridgeFragment;->getArguments()Landroid/os/Bundle;

    move-result-object v0

    if-eqz v0, :cond_0

    .line 77
    invoke-virtual {p0}, Lcom/getcapacitor/BridgeFragment;->getArguments()Landroid/os/Bundle;

    move-result-object v0

    const-string v1, "startDir"

    invoke-virtual {v0, v1}, Landroid/os/Bundle;->getString(Ljava/lang/String;)Ljava/lang/String;

    move-result-object v0

    goto :goto_0

    :cond_0
    const/4 v0, 0x0

    .line 80
    :goto_0
    new-instance v1, Lcom/getcapacitor/Bridge$Builder;

    invoke-direct {v1, p0}, Lcom/getcapacitor/Bridge$Builder;-><init>(Landroidx/fragment/app/Fragment;)V

    .line 82
    invoke-virtual {v1, p1}, Lcom/getcapacitor/Bridge$Builder;->setInstanceState(Landroid/os/Bundle;)Lcom/getcapacitor/Bridge$Builder;

    move-result-object p1

    iget-object v1, p0, Lcom/getcapacitor/BridgeFragment;->initialPlugins:Ljava/util/List;

    .line 83
    invoke-virtual {p1, v1}, Lcom/getcapacitor/Bridge$Builder;->setPlugins(Ljava/util/List;)Lcom/getcapacitor/Bridge$Builder;

    move-result-object p1

    iget-object v1, p0, Lcom/getcapacitor/BridgeFragment;->config:Lcom/getcapacitor/CapConfig;

    .line 84
    invoke-virtual {p1, v1}, Lcom/getcapacitor/Bridge$Builder;->setConfig(Lcom/getcapacitor/CapConfig;)Lcom/getcapacitor/Bridge$Builder;

    move-result-object p1

    iget-object v1, p0, Lcom/getcapacitor/BridgeFragment;->webViewListeners:Ljava/util/List;

    .line 85
    invoke-virtual {p1, v1}, Lcom/getcapacitor/Bridge$Builder;->addWebViewListeners(Ljava/util/List;)Lcom/getcapacitor/Bridge$Builder;

    move-result-object p1

    .line 86
    invoke-virtual {p1}, Lcom/getcapacitor/Bridge$Builder;->create()Lcom/getcapacitor/Bridge;

    move-result-object p1

    iput-object p1, p0, Lcom/getcapacitor/BridgeFragment;->bridge:Lcom/getcapacitor/Bridge;

    if-eqz v0, :cond_1

    .line 89
    invoke-virtual {p1, v0}, Lcom/getcapacitor/Bridge;->setServerAssetPath(Ljava/lang/String;)V

    :cond_1
    iget-object p1, p0, Lcom/getcapacitor/BridgeFragment;->bridge:Lcom/getcapacitor/Bridge;

    .line 92
    invoke-virtual {p1}, Lcom/getcapacitor/Bridge;->shouldKeepRunning()Z

    move-result p1

    iput-boolean p1, p0, Lcom/getcapacitor/BridgeFragment;->keepRunning:Z

    return-void
.end method

.method public onCreate(Landroid/os/Bundle;)V
    .locals 0

    .line 112
    invoke-super {p0, p1}, Landroidx/fragment/app/Fragment;->onCreate(Landroid/os/Bundle;)V

    return-void
.end method

.method public onCreateView(Landroid/view/LayoutInflater;Landroid/view/ViewGroup;Landroid/os/Bundle;)Landroid/view/View;
    .locals 1

    .line 118
    sget p3, Lcom/getcapacitor/android/R$layout;->fragment_bridge:I

    const/4 v0, 0x0

    invoke-virtual {p1, p3, p2, v0}, Landroid/view/LayoutInflater;->inflate(ILandroid/view/ViewGroup;Z)Landroid/view/View;

    move-result-object p1

    return-object p1
.end method

.method public onDestroy()V
    .locals 1

    .line 129
    invoke-super {p0}, Landroidx/fragment/app/Fragment;->onDestroy()V

    iget-object v0, p0, Lcom/getcapacitor/BridgeFragment;->bridge:Lcom/getcapacitor/Bridge;

    if-eqz v0, :cond_0

    .line 131
    invoke-virtual {v0}, Lcom/getcapacitor/Bridge;->onDestroy()V

    :cond_0
    return-void
.end method

.method public onInflate(Landroid/content/Context;Landroid/util/AttributeSet;Landroid/os/Bundle;)V
    .locals 0

    .line 97
    invoke-super {p0, p1, p2, p3}, Landroidx/fragment/app/Fragment;->onInflate(Landroid/content/Context;Landroid/util/AttributeSet;Landroid/os/Bundle;)V

    .line 99
    sget-object p3, Lcom/getcapacitor/android/R$styleable;->bridge_fragment:[I

    invoke-virtual {p1, p2, p3}, Landroid/content/Context;->obtainStyledAttributes(Landroid/util/AttributeSet;[I)Landroid/content/res/TypedArray;

    move-result-object p1

    .line 100
    sget p2, Lcom/getcapacitor/android/R$styleable;->bridge_fragment_start_dir:I

    invoke-virtual {p1, p2}, Landroid/content/res/TypedArray;->getString(I)Ljava/lang/String;

    move-result-object p1

    if-eqz p1, :cond_0

    .line 103
    invoke-interface {p1}, Ljava/lang/CharSequence;->toString()Ljava/lang/String;

    move-result-object p1

    .line 104
    new-instance p2, Landroid/os/Bundle;

    invoke-direct {p2}, Landroid/os/Bundle;-><init>()V

    const-string p3, "startDir"

    .line 105
    invoke-virtual {p2, p3, p1}, Landroid/os/Bundle;->putString(Ljava/lang/String;Ljava/lang/String;)V

    .line 106
    invoke-virtual {p0, p2}, Lcom/getcapacitor/BridgeFragment;->setArguments(Landroid/os/Bundle;)V

    :cond_0
    return-void
.end method

.method public onViewCreated(Landroid/view/View;Landroid/os/Bundle;)V
    .locals 0

    .line 123
    invoke-super {p0, p1, p2}, Landroidx/fragment/app/Fragment;->onViewCreated(Landroid/view/View;Landroid/os/Bundle;)V

    .line 124
    invoke-virtual {p0, p2}, Lcom/getcapacitor/BridgeFragment;->load(Landroid/os/Bundle;)V

    return-void
.end method

.method public setConfig(Lcom/getcapacitor/CapConfig;)V
    .locals 0

    iput-object p1, p0, Lcom/getcapacitor/BridgeFragment;->config:Lcom/getcapacitor/CapConfig;

    return-void
.end method
