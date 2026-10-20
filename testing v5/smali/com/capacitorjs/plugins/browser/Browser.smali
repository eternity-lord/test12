.class public Lcom/capacitorjs/plugins/browser/Browser;
.super Ljava/lang/Object;
.source "Browser.java"


# annotations
.annotation system Ldalvik/annotation/MemberClasses;
    value = {
        Lcom/capacitorjs/plugins/browser/Browser$BrowserEventListener;
    }
.end annotation


# static fields
.field public static final BROWSER_FINISHED:I = 0x2

.field public static final BROWSER_LOADED:I = 0x1

.field private static final FALLBACK_CUSTOM_TAB_PACKAGE_NAME:Ljava/lang/String; = "com.android.chrome"


# instance fields
.field private browserEventListener:Lcom/capacitorjs/plugins/browser/Browser$BrowserEventListener;

.field private browserSession:Landroidx/browser/customtabs/CustomTabsSession;

.field private connection:Landroidx/browser/customtabs/CustomTabsServiceConnection;

.field private context:Landroid/content/Context;

.field private customTabsClient:Landroidx/browser/customtabs/CustomTabsClient;

.field private group:Lcom/capacitorjs/plugins/browser/EventGroup;

.field private isInitialLoad:Z


# direct methods
.method public static synthetic $r8$lambda$OIN0HfGVN8d322IGEBTVkXwSweg(Lcom/capacitorjs/plugins/browser/Browser;)V
    .locals 0

    invoke-direct {p0}, Lcom/capacitorjs/plugins/browser/Browser;->handleGroupCompletion()V

    return-void
.end method

.method static bridge synthetic -$$Nest$fputcustomTabsClient(Lcom/capacitorjs/plugins/browser/Browser;Landroidx/browser/customtabs/CustomTabsClient;)V
    .locals 0

    iput-object p1, p0, Lcom/capacitorjs/plugins/browser/Browser;->customTabsClient:Landroidx/browser/customtabs/CustomTabsClient;

    return-void
.end method

.method static bridge synthetic -$$Nest$mhandledNavigationEvent(Lcom/capacitorjs/plugins/browser/Browser;I)V
    .locals 0

    invoke-direct {p0, p1}, Lcom/capacitorjs/plugins/browser/Browser;->handledNavigationEvent(I)V

    return-void
.end method

.method public constructor <init>(Landroid/content/Context;)V
    .locals 1

    .line 62
    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    const/4 v0, 0x0

    iput-boolean v0, p0, Lcom/capacitorjs/plugins/browser/Browser;->isInitialLoad:Z

    .line 47
    new-instance v0, Lcom/capacitorjs/plugins/browser/Browser$1;

    invoke-direct {v0, p0}, Lcom/capacitorjs/plugins/browser/Browser$1;-><init>(Lcom/capacitorjs/plugins/browser/Browser;)V

    iput-object v0, p0, Lcom/capacitorjs/plugins/browser/Browser;->connection:Landroidx/browser/customtabs/CustomTabsServiceConnection;

    iput-object p1, p0, Lcom/capacitorjs/plugins/browser/Browser;->context:Landroid/content/Context;

    .line 64
    new-instance p1, Lcom/capacitorjs/plugins/browser/EventGroup;

    new-instance v0, Lcom/capacitorjs/plugins/browser/Browser$$ExternalSyntheticLambda0;

    invoke-direct {v0, p0}, Lcom/capacitorjs/plugins/browser/Browser$$ExternalSyntheticLambda0;-><init>(Lcom/capacitorjs/plugins/browser/Browser;)V

    invoke-direct {p1, v0}, Lcom/capacitorjs/plugins/browser/EventGroup;-><init>(Lcom/capacitorjs/plugins/browser/EventGroup$EventGroupCompletion;)V

    iput-object p1, p0, Lcom/capacitorjs/plugins/browser/Browser;->group:Lcom/capacitorjs/plugins/browser/EventGroup;

    return-void
.end method

.method private getCustomTabsSession()Landroidx/browser/customtabs/CustomTabsSession;
    .locals 2

    iget-object v0, p0, Lcom/capacitorjs/plugins/browser/Browser;->customTabsClient:Landroidx/browser/customtabs/CustomTabsClient;

    if-nez v0, :cond_0

    const/4 v0, 0x0

    return-object v0

    :cond_0
    iget-object v1, p0, Lcom/capacitorjs/plugins/browser/Browser;->browserSession:Landroidx/browser/customtabs/CustomTabsSession;

    if-nez v1, :cond_1

    .line 171
    new-instance v1, Lcom/capacitorjs/plugins/browser/Browser$2;

    invoke-direct {v1, p0}, Lcom/capacitorjs/plugins/browser/Browser$2;-><init>(Lcom/capacitorjs/plugins/browser/Browser;)V

    .line 172
    invoke-virtual {v0, v1}, Landroidx/browser/customtabs/CustomTabsClient;->newSession(Landroidx/browser/customtabs/CustomTabsCallback;)Landroidx/browser/customtabs/CustomTabsSession;

    move-result-object v0

    iput-object v0, p0, Lcom/capacitorjs/plugins/browser/Browser;->browserSession:Landroidx/browser/customtabs/CustomTabsSession;

    :cond_1
    iget-object v0, p0, Lcom/capacitorjs/plugins/browser/Browser;->browserSession:Landroidx/browser/customtabs/CustomTabsSession;

    return-object v0
.end method

.method private handleGroupCompletion()V
    .locals 2

    iget-object v0, p0, Lcom/capacitorjs/plugins/browser/Browser;->browserEventListener:Lcom/capacitorjs/plugins/browser/Browser$BrowserEventListener;

    if-eqz v0, :cond_0

    const/4 v1, 0x2

    .line 160
    invoke-interface {v0, v1}, Lcom/capacitorjs/plugins/browser/Browser$BrowserEventListener;->onBrowserEvent(I)V

    :cond_0
    return-void
.end method

.method private handledNavigationEvent(I)V
    .locals 1

    const/4 v0, 0x2

    if-eq p1, v0, :cond_2

    const/4 v0, 0x5

    if-eq p1, v0, :cond_1

    const/4 v0, 0x6

    if-eq p1, v0, :cond_0

    goto :goto_0

    :cond_0
    iget-object p1, p0, Lcom/capacitorjs/plugins/browser/Browser;->group:Lcom/capacitorjs/plugins/browser/EventGroup;

    .line 147
    invoke-virtual {p1}, Lcom/capacitorjs/plugins/browser/EventGroup;->leave()V

    goto :goto_0

    :cond_1
    iget-object p1, p0, Lcom/capacitorjs/plugins/browser/Browser;->group:Lcom/capacitorjs/plugins/browser/EventGroup;

    .line 150
    invoke-virtual {p1}, Lcom/capacitorjs/plugins/browser/EventGroup;->enter()V

    goto :goto_0

    :cond_2
    iget-boolean p1, p0, Lcom/capacitorjs/plugins/browser/Browser;->isInitialLoad:Z

    if-eqz p1, :cond_4

    iget-object p1, p0, Lcom/capacitorjs/plugins/browser/Browser;->browserEventListener:Lcom/capacitorjs/plugins/browser/Browser$BrowserEventListener;

    if-eqz p1, :cond_3

    const/4 v0, 0x1

    .line 141
    invoke-interface {p1, v0}, Lcom/capacitorjs/plugins/browser/Browser$BrowserEventListener;->onBrowserEvent(I)V

    :cond_3
    const/4 p1, 0x0

    iput-boolean p1, p0, Lcom/capacitorjs/plugins/browser/Browser;->isInitialLoad:Z

    :cond_4
    :goto_0
    return-void
.end method


# virtual methods
.method public bindService()Z
    .locals 3

    iget-object v0, p0, Lcom/capacitorjs/plugins/browser/Browser;->context:Landroid/content/Context;

    const/4 v1, 0x0

    .line 119
    invoke-static {v0, v1}, Landroidx/browser/customtabs/CustomTabsClient;->getPackageName(Landroid/content/Context;Ljava/util/List;)Ljava/lang/String;

    move-result-object v0

    if-nez v0, :cond_0

    const-string v0, "com.android.chrome"

    :cond_0
    iget-object v1, p0, Lcom/capacitorjs/plugins/browser/Browser;->context:Landroid/content/Context;

    iget-object v2, p0, Lcom/capacitorjs/plugins/browser/Browser;->connection:Landroidx/browser/customtabs/CustomTabsServiceConnection;

    .line 123
    invoke-static {v1, v0, v2}, Landroidx/browser/customtabs/CustomTabsClient;->bindCustomTabsService(Landroid/content/Context;Ljava/lang/String;Landroidx/browser/customtabs/CustomTabsServiceConnection;)Z

    move-result v0

    iget-object v1, p0, Lcom/capacitorjs/plugins/browser/Browser;->group:Lcom/capacitorjs/plugins/browser/EventGroup;

    .line 124
    invoke-virtual {v1}, Lcom/capacitorjs/plugins/browser/EventGroup;->leave()V

    return v0
.end method

.method public getBrowserEventListenerListener()Lcom/capacitorjs/plugins/browser/Browser$BrowserEventListener;
    .locals 1

    iget-object v0, p0, Lcom/capacitorjs/plugins/browser/Browser;->browserEventListener:Lcom/capacitorjs/plugins/browser/Browser$BrowserEventListener;

    return-object v0
.end method

.method public open(Landroid/net/Uri;)V
    .locals 1

    const/4 v0, 0x0

    .line 89
    invoke-virtual {p0, p1, v0}, Lcom/capacitorjs/plugins/browser/Browser;->open(Landroid/net/Uri;Ljava/lang/Integer;)V

    return-void
.end method

.method public open(Landroid/net/Uri;Ljava/lang/Integer;)V
    .locals 4

    .line 98
    new-instance v0, Landroidx/browser/customtabs/CustomTabsIntent$Builder;

    invoke-direct {p0}, Lcom/capacitorjs/plugins/browser/Browser;->getCustomTabsSession()Landroidx/browser/customtabs/CustomTabsSession;

    move-result-object v1

    invoke-direct {v0, v1}, Landroidx/browser/customtabs/CustomTabsIntent$Builder;-><init>(Landroidx/browser/customtabs/CustomTabsSession;)V

    const/4 v1, 0x1

    .line 100
    invoke-virtual {v0, v1}, Landroidx/browser/customtabs/CustomTabsIntent$Builder;->setShareState(I)Landroidx/browser/customtabs/CustomTabsIntent$Builder;

    if-eqz p2, :cond_0

    .line 103
    new-instance v2, Landroidx/browser/customtabs/CustomTabColorSchemeParams$Builder;

    invoke-direct {v2}, Landroidx/browser/customtabs/CustomTabColorSchemeParams$Builder;-><init>()V

    invoke-virtual {p2}, Ljava/lang/Integer;->intValue()I

    move-result p2

    invoke-virtual {v2, p2}, Landroidx/browser/customtabs/CustomTabColorSchemeParams$Builder;->setToolbarColor(I)Landroidx/browser/customtabs/CustomTabColorSchemeParams$Builder;

    move-result-object p2

    invoke-virtual {p2}, Landroidx/browser/customtabs/CustomTabColorSchemeParams$Builder;->build()Landroidx/browser/customtabs/CustomTabColorSchemeParams;

    move-result-object p2

    .line 104
    invoke-virtual {v0, p2}, Landroidx/browser/customtabs/CustomTabsIntent$Builder;->setDefaultColorSchemeParams(Landroidx/browser/customtabs/CustomTabColorSchemeParams;)Landroidx/browser/customtabs/CustomTabsIntent$Builder;

    .line 107
    :cond_0
    invoke-virtual {v0}, Landroidx/browser/customtabs/CustomTabsIntent$Builder;->build()Landroidx/browser/customtabs/CustomTabsIntent;

    move-result-object p2

    .line 108
    iget-object v0, p2, Landroidx/browser/customtabs/CustomTabsIntent;->intent:Landroid/content/Intent;

    new-instance v2, Ljava/lang/StringBuilder;

    const-string v3, "2//"

    invoke-direct {v2, v3}, Ljava/lang/StringBuilder;-><init>(Ljava/lang/String;)V

    iget-object v3, p0, Lcom/capacitorjs/plugins/browser/Browser;->context:Landroid/content/Context;

    invoke-virtual {v3}, Landroid/content/Context;->getPackageName()Ljava/lang/String;

    move-result-object v3

    invoke-virtual {v2, v3}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v2}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object v2

    invoke-static {v2}, Landroid/net/Uri;->parse(Ljava/lang/String;)Landroid/net/Uri;

    move-result-object v2

    const-string v3, "android.intent.extra.REFERRER"

    invoke-virtual {v0, v3, v2}, Landroid/content/Intent;->putExtra(Ljava/lang/String;Landroid/os/Parcelable;)Landroid/content/Intent;

    iput-boolean v1, p0, Lcom/capacitorjs/plugins/browser/Browser;->isInitialLoad:Z

    iget-object v0, p0, Lcom/capacitorjs/plugins/browser/Browser;->group:Lcom/capacitorjs/plugins/browser/EventGroup;

    .line 111
    invoke-virtual {v0}, Lcom/capacitorjs/plugins/browser/EventGroup;->reset()V

    iget-object v0, p0, Lcom/capacitorjs/plugins/browser/Browser;->context:Landroid/content/Context;

    .line 112
    invoke-virtual {p2, v0, p1}, Landroidx/browser/customtabs/CustomTabsIntent;->launchUrl(Landroid/content/Context;Landroid/net/Uri;)V

    return-void
.end method

.method public setBrowserEventListener(Lcom/capacitorjs/plugins/browser/Browser$BrowserEventListener;)V
    .locals 0

    iput-object p1, p0, Lcom/capacitorjs/plugins/browser/Browser;->browserEventListener:Lcom/capacitorjs/plugins/browser/Browser$BrowserEventListener;

    return-void
.end method

.method public unbindService()V
    .locals 2

    iget-object v0, p0, Lcom/capacitorjs/plugins/browser/Browser;->context:Landroid/content/Context;

    iget-object v1, p0, Lcom/capacitorjs/plugins/browser/Browser;->connection:Landroidx/browser/customtabs/CustomTabsServiceConnection;

    .line 132
    invoke-virtual {v0, v1}, Landroid/content/Context;->unbindService(Landroid/content/ServiceConnection;)V

    iget-object v0, p0, Lcom/capacitorjs/plugins/browser/Browser;->group:Lcom/capacitorjs/plugins/browser/EventGroup;

    .line 133
    invoke-virtual {v0}, Lcom/capacitorjs/plugins/browser/EventGroup;->enter()V

    return-void
.end method
