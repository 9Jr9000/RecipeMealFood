# Recipe Box

A recipe manager and grocery list that stay in sync, laid out like Paprika and Deglaze.
It ships with no recipes and never suggests any. Everything you see is something you added.

## Features

- **Recipes**: a photo grid with search, categories and sorting. Each recipe has a photo, rating, servings, prep and cook time, source, ingredients (with section headings), directions and notes. You can scale ingredients, tap an ingredient to cross it off, and tap a step to mark your place.
- **Paste to import**: paste a recipe copied from anywhere, and the name, ingredients, directions, servings and times are filled in for you to review.
- **Grocery list**: grouped by aisle or by recipe. The same ingredient from different recipes (or typed in by you) is combined into one item with the amounts added up (e.g. `1 tbsp + 3 tsp` → `2 tbsp`).
- **Pantry**: what you have at home.

## How the sync works

- Each ingredient on a recipe shows whether it is **in your pantry**, **on your grocery list**, or **needed**.
- *Add to Grocery List* preselects only what you need. Pantry items are left unchecked. Items another recipe already put on the list are preselected so their amounts combine. Items this recipe already added are left unchecked, so they aren't doubled.
- Checking items off moves them to **In Cart**. *Move to Pantry* then puts them in your pantry, so the next recipe knows you have them.
- Removing a recipe from the list (✕ on its chip), or deleting the recipe, removes its amounts and leaves the other recipes' amounts alone.
- If something on the list is added to the pantry, the list offers to remove it.
- Marking a pantry item *Used Up* offers to add it back to the grocery list.
- Matching ignores prep words and plurals (`2 large tomatoes, chopped` matches `tomato`). It also ignores descriptors like `kosher`/`unsalted` (`kosher salt` matches `salt`).
- An aisle you pick for an item is remembered.

## Running it

It's a static web app with no build step and no dependencies.

```sh
npm start            # serves at http://localhost:8080 (python3 -m http.server)
npm test             # unit tests for parsing and sync logic (Node 20+)
```

To use it on your phone, host the folder anywhere that serves static files over HTTPS (e.g. GitHub Pages). Then open it and choose **Add to Home Screen**. It runs full-screen and works offline.

Data is stored on the device (IndexedDB). Use **Settings → Export Backup** to save it or move it to another device.

## Code layout

- `js/ingredients.js`: parsing ingredient lines, name normalization, aisle guessing, and unit math
- `js/sync.js`: recipe, grocery list and pantry operations that keep everything consistent
- `js/app.js`: UI (views, sheets, routing)
- `js/db.js`: IndexedDB storage
- `sw.js`, `manifest.webmanifest`: offline support and installability
