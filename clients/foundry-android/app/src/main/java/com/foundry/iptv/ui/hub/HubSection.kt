package com.foundry.iptv.ui.hub

/**
 * The eight top-level destinations in the Foundry TV hub. Order matches the
 * visual rail from left to right. Adding a new section here automatically
 * wires it into the rail and the NavHost — wave agents replacing a placeholder
 * should update [FoundryHub.sectionContent] rather than touching this enum.
 */
enum class HubSection(val label: String) {
    Live("Live"),
    Guide("Guide"),
    Vod("VOD"),
    Series("Series"),
    Decks("Decks"),
    Multiview("Multiview"),
    Search("Search"),
    Settings("Settings"),
}
