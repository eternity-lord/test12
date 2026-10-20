.class public Landroidx/webkit/internal/WebSettingsAdapter;
.super Ljava/lang/Object;
.source "WebSettingsAdapter.java"


# instance fields
.field private final mBoundaryInterface:Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;


# direct methods
.method public constructor <init>(Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;)V
    .locals 0

    .line 36
    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    iput-object p1, p0, Landroidx/webkit/internal/WebSettingsAdapter;->mBoundaryInterface:Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;

    return-void
.end method


# virtual methods
.method public getAttributionRegistrationBehavior()I
    .locals 1

    iget-object v0, p0, Landroidx/webkit/internal/WebSettingsAdapter;->mBoundaryInterface:Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;

    .line 183
    invoke-interface {v0}, Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;->getAttributionBehavior()I

    move-result v0

    return v0
.end method

.method public getDisabledActionModeMenuItems()I
    .locals 1

    iget-object v0, p0, Landroidx/webkit/internal/WebSettingsAdapter;->mBoundaryInterface:Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;

    .line 79
    invoke-interface {v0}, Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;->getDisabledActionModeMenuItems()I

    move-result v0

    return v0
.end method

.method public getEnterpriseAuthenticationAppLinkPolicyEnabled()Z
    .locals 1

    iget-object v0, p0, Landroidx/webkit/internal/WebSettingsAdapter;->mBoundaryInterface:Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;

    .line 137
    invoke-interface {v0}, Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;->getEnterpriseAuthenticationAppLinkPolicyEnabled()Z

    move-result v0

    return v0
.end method

.method public getForceDark()I
    .locals 1

    iget-object v0, p0, Landroidx/webkit/internal/WebSettingsAdapter;->mBoundaryInterface:Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;

    .line 93
    invoke-interface {v0}, Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;->getForceDark()I

    move-result v0

    return v0
.end method

.method public getForceDarkStrategy()I
    .locals 1

    iget-object v0, p0, Landroidx/webkit/internal/WebSettingsAdapter;->mBoundaryInterface:Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;

    .line 107
    invoke-interface {v0}, Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;->getForceDarkBehavior()I

    move-result v0

    return v0
.end method

.method public getOffscreenPreRaster()Z
    .locals 1

    iget-object v0, p0, Landroidx/webkit/internal/WebSettingsAdapter;->mBoundaryInterface:Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;

    .line 51
    invoke-interface {v0}, Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;->getOffscreenPreRaster()Z

    move-result v0

    return v0
.end method

.method public getRequestedWithHeaderOriginAllowList()Ljava/util/Set;
    .locals 1
    .annotation system Ldalvik/annotation/Signature;
        value = {
            "()",
            "Ljava/util/Set<",
            "Ljava/lang/String;",
            ">;"
        }
    .end annotation

    iget-object v0, p0, Landroidx/webkit/internal/WebSettingsAdapter;->mBoundaryInterface:Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;

    .line 146
    invoke-interface {v0}, Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;->getRequestedWithHeaderOriginAllowList()Ljava/util/Set;

    move-result-object v0

    return-object v0
.end method

.method public getSafeBrowsingEnabled()Z
    .locals 1

    iget-object v0, p0, Landroidx/webkit/internal/WebSettingsAdapter;->mBoundaryInterface:Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;

    .line 65
    invoke-interface {v0}, Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;->getSafeBrowsingEnabled()Z

    move-result v0

    return v0
.end method

.method public getUserAgentMetadata()Landroidx/webkit/UserAgentMetadata;
    .locals 1

    iget-object v0, p0, Landroidx/webkit/internal/WebSettingsAdapter;->mBoundaryInterface:Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;

    .line 165
    invoke-interface {v0}, Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;->getUserAgentMetadataMap()Ljava/util/Map;

    move-result-object v0

    .line 164
    invoke-static {v0}, Landroidx/webkit/internal/UserAgentMetadataInternal;->getUserAgentMetadataFromMap(Ljava/util/Map;)Landroidx/webkit/UserAgentMetadata;

    move-result-object v0

    return-object v0
.end method

.method public isAlgorithmicDarkeningAllowed()Z
    .locals 1

    iget-object v0, p0, Landroidx/webkit/internal/WebSettingsAdapter;->mBoundaryInterface:Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;

    .line 121
    invoke-interface {v0}, Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;->isAlgorithmicDarkeningAllowed()Z

    move-result v0

    return v0
.end method

.method public setAlgorithmicDarkeningAllowed(Z)V
    .locals 1

    iget-object v0, p0, Landroidx/webkit/internal/WebSettingsAdapter;->mBoundaryInterface:Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;

    .line 114
    invoke-interface {v0, p1}, Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;->setAlgorithmicDarkeningAllowed(Z)V

    return-void
.end method

.method public setAttributionRegistrationBehavior(I)V
    .locals 1

    iget-object v0, p0, Landroidx/webkit/internal/WebSettingsAdapter;->mBoundaryInterface:Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;

    .line 191
    invoke-interface {v0, p1}, Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;->setAttributionBehavior(I)V

    return-void
.end method

.method public setDisabledActionModeMenuItems(I)V
    .locals 1

    iget-object v0, p0, Landroidx/webkit/internal/WebSettingsAdapter;->mBoundaryInterface:Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;

    .line 72
    invoke-interface {v0, p1}, Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;->setDisabledActionModeMenuItems(I)V

    return-void
.end method

.method public setEnterpriseAuthenticationAppLinkPolicyEnabled(Z)V
    .locals 1

    iget-object v0, p0, Landroidx/webkit/internal/WebSettingsAdapter;->mBoundaryInterface:Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;

    .line 129
    invoke-interface {v0, p1}, Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;->setEnterpriseAuthenticationAppLinkPolicyEnabled(Z)V

    return-void
.end method

.method public setForceDark(I)V
    .locals 1

    iget-object v0, p0, Landroidx/webkit/internal/WebSettingsAdapter;->mBoundaryInterface:Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;

    .line 86
    invoke-interface {v0, p1}, Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;->setForceDark(I)V

    return-void
.end method

.method public setForceDarkStrategy(I)V
    .locals 1

    iget-object v0, p0, Landroidx/webkit/internal/WebSettingsAdapter;->mBoundaryInterface:Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;

    .line 100
    invoke-interface {v0, p1}, Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;->setForceDarkBehavior(I)V

    return-void
.end method

.method public setOffscreenPreRaster(Z)V
    .locals 1

    iget-object v0, p0, Landroidx/webkit/internal/WebSettingsAdapter;->mBoundaryInterface:Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;

    .line 44
    invoke-interface {v0, p1}, Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;->setOffscreenPreRaster(Z)V

    return-void
.end method

.method public setRequestedWithHeaderOriginAllowList(Ljava/util/Set;)V
    .locals 1
    .annotation system Ldalvik/annotation/Signature;
        value = {
            "(",
            "Ljava/util/Set<",
            "Ljava/lang/String;",
            ">;)V"
        }
    .end annotation

    iget-object v0, p0, Landroidx/webkit/internal/WebSettingsAdapter;->mBoundaryInterface:Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;

    .line 155
    invoke-interface {v0, p1}, Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;->setRequestedWithHeaderOriginAllowList(Ljava/util/Set;)V

    return-void
.end method

.method public setSafeBrowsingEnabled(Z)V
    .locals 1

    iget-object v0, p0, Landroidx/webkit/internal/WebSettingsAdapter;->mBoundaryInterface:Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;

    .line 58
    invoke-interface {v0, p1}, Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;->setSafeBrowsingEnabled(Z)V

    return-void
.end method

.method public setUserAgentMetadata(Landroidx/webkit/UserAgentMetadata;)V
    .locals 1

    iget-object v0, p0, Landroidx/webkit/internal/WebSettingsAdapter;->mBoundaryInterface:Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;

    .line 175
    invoke-static {p1}, Landroidx/webkit/internal/UserAgentMetadataInternal;->convertUserAgentMetadataToMap(Landroidx/webkit/UserAgentMetadata;)Ljava/util/Map;

    move-result-object p1

    .line 174
    invoke-interface {v0, p1}, Lorg/chromium/support_lib_boundary/WebSettingsBoundaryInterface;->setUserAgentMetadataFromMap(Ljava/util/Map;)V

    return-void
.end method
