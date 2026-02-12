const { menu, global, console } = iina;

const YOUTUBE_SPLASH_URL =
    "~/Library/Application Support/com.colliderli.iina/plugins/xyz.brbc.youtube.iinaplugin/assets/YouTube.png";

console.log("YouTube: Global entry loaded");

let activePlayerId: number | string | null = null;
let pendingShowSidebar = false;
let pendingPlayerId: number | string | null = null;

global.onMessage("playerReady", (data, playerId) => {
    const resolvedPlayerId = playerId ?? null;
    console.log("YouTube: Player registered:", resolvedPlayerId);
    if (resolvedPlayerId === null) {
        return;
    }
    activePlayerId = resolvedPlayerId;

    if (pendingShowSidebar && pendingPlayerId !== null && String(pendingPlayerId) === String(resolvedPlayerId)) {
        console.log("YouTube: Sending pending showSidebar to:", resolvedPlayerId);
        global.postMessage(resolvedPlayerId, "showYouTubeSidebar", {});
        pendingShowSidebar = false;
        pendingPlayerId = null;
    }
});

global.onMessage("sidebarShown", (data, playerId) => {
    console.log("YouTube: Sidebar shown in player:", playerId);
});

async function handleMenuAction(): Promise<void> {
    console.log("YouTube: Menu item clicked, activePlayerId =", activePlayerId);

    if (activePlayerId !== null) {
        console.log("YouTube: Sending showSidebar to existing player:", activePlayerId);
        global.postMessage(activePlayerId, "showYouTubeSidebar", {});
        return;
    }

    console.log("YouTube: No active player, creating with splash image");

    const playerId = global.createPlayerInstance({
        url: YOUTUBE_SPLASH_URL,
        enablePlugins: true
    });

    console.log("YouTube: Created player instance:", playerId);

    activePlayerId = playerId;
    pendingShowSidebar = true;
    pendingPlayerId = playerId;

    global.postMessage(null, "showYouTubeSidebar", {});
}

const menuItem = menu.item(
    "YouTube",
    () => {
        handleMenuAction().catch((error) => {
            console.error(`YouTube: Error in menu handler: ${error instanceof Error ? error.message : String(error)}`);
        });
    },
    { keyBinding: "Shift+Y" }
);

menu.addItem(menuItem);
console.log("YouTube: Menu item registered (Shift+Y)");
