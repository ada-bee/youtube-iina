export const tabs = document.querySelectorAll<HTMLButtonElement>(".yt-tab");
export const views = document.querySelectorAll<HTMLElement>(".yt-view");
export const feedTab = document.querySelector<HTMLButtonElement>('.yt-tab[data-view="feed"]')!;
export const subscriptionsTab = document.querySelector<HTMLButtonElement>('.yt-tab[data-view="subscriptions"]')!;
export const favoritesTab = document.querySelector<HTMLButtonElement>('.yt-tab[data-view="favorites"]')!;
export const feedFavoritesList = document.querySelector<HTMLUListElement>("[data-feed-favorites]")!;
export const feedEmptyState = document.querySelector<HTMLElement>("[data-feed-empty]")!;
export const feedStatus = document.querySelector<HTMLElement>("[data-feed-status]")!;
export const feedLoadingIndicator = document.querySelector<HTMLElement>("[data-feed-loading]")!;
export const homeRefreshButton = document.querySelector<HTMLButtonElement>("[data-home-refresh]")!;
export const authToggleButton = document.querySelector<HTMLButtonElement>("[data-auth-toggle]")!;
export const authStatus = document.querySelector<HTMLElement>("[data-auth-status]")!;
export const authPanel = document.querySelector<HTMLElement>("[data-auth-panel]")!;
export const authPanelCode = document.querySelector<HTMLInputElement>("[data-auth-code]")!;
export const authPanelUrl = document.querySelector<HTMLAnchorElement>("[data-auth-url]")!;

export const subscriptionsList = document.querySelector<HTMLUListElement>("[data-subscriptions-list]")!;
export const subscriptionsEmptyState = document.querySelector<HTMLElement>("[data-subscriptions-empty]")!;
export const subscriptionsStatus = document.querySelector<HTMLElement>("[data-subscriptions-status]")!;
export const subscriptionsLoadingIndicator = document.querySelector<HTMLElement>("[data-subscriptions-loading]")!;

export const relatedTab = document.querySelector<HTMLButtonElement>('.yt-tab[data-view="related"]')!;
export const relatedList = document.querySelector<HTMLUListElement>("[data-related-list]")!;
export const relatedEmptyState = document.querySelector<HTMLElement>("[data-related-empty]")!;
export const relatedStatus = document.querySelector<HTMLElement>("[data-related-status]")!;
export const relatedLoadingIndicator = document.querySelector<HTMLElement>("[data-related-loading]")!;

export const searchForm = document.querySelector<HTMLFormElement>("[data-search-form]")!;
export const searchInput = document.querySelector<HTMLInputElement>("[data-search-input]")!;
export const searchStatus = document.querySelector<HTMLElement>("[data-search-status]")!;
export const searchLoadingIndicator = document.querySelector<HTMLElement>("[data-search-loading]")!;
export const channelsList = document.querySelector<HTMLUListElement>("[data-channels-list]")!;
export const videosList = document.querySelector<HTMLUListElement>("[data-videos-list]")!;
export const channelsEmptyState = document.querySelector<HTMLElement>("[data-channels-empty]")!;
export const videosEmptyState = document.querySelector<HTMLElement>("[data-videos-empty]")!;

export const favoritesList = document.querySelector<HTMLUListElement>("[data-favorites-list]")!;
export const favoritesEmptyState = document.querySelector<HTMLElement>("[data-favorites-empty]")!;
