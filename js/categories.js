// Category groups for browsing recipes, and automatic suggestions from a recipe's name,
// ingredients and (for imported recipes) the website's own category hints.

import { parseIngredients } from './ingredients.js';

export const CATEGORY_GROUPS = [
  { name: 'Meal', items: ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Dessert', 'Side Dish', 'Drinks'] },
  { name: 'Protein', items: ['Chicken', 'Beef', 'Pork', 'Turkey', 'Seafood', 'Vegetarian'] },
  { name: 'Type', items: ['Pasta', 'Sandwiches & Burgers', 'Tacos & Burritos', 'Soups & Stews', 'Salads', 'Pizza', 'Rice & Bowls', 'Casseroles', 'Baking'] },
  { name: 'Method', items: ['Air Fryer', 'Slow Cooker', 'Instant Pot', 'One Pot & Pan', 'Sheet Pan', 'Grilled', 'No Cook', 'Meal Prep', 'Freezer Friendly'] },
  { name: 'Cuisine', items: ['Mexican', 'Italian', 'Chinese', 'Japanese', 'Korean', 'Thai', 'Vietnamese', 'Indian', 'Mediterranean', 'Cajun & Southern'] },
];

// Older names, renamed when the Method and Cuisine groups were added.
const RENAMED = { 'Tacos & Mexican': ['Tacos & Burritos', 'Mexican'] };

// Updates recipes saved with old category names. Returns the recipes that changed.
export function migrateCategories(recipes) {
  const changed = [];
  for (const r of recipes || []) {
    const cats = r.categories || [];
    if (!cats.some(c => c in RENAMED)) continue;
    r.categories = [...new Set(cats.flatMap(c => RENAMED[c] || [c]))];
    changed.push(r);
  }
  return changed;
}
export const PRESET_CATEGORIES = CATEGORY_GROUPS.flatMap(g => g.items);

export function groupOf(category) {
  const g = CATEGORY_GROUPS.find(gr => gr.items.includes(category));
  return g ? g.name : 'My Categories';
}

const PROTEIN = [
  ['Chicken', /\bchicken\b/],
  ['Beef', /\b(beef|steak|brisket|sirloin|ribeye|rib eye|short ribs?|ground chuck|birria|barbacoa)\b/],
  ['Pork', /\b(pork|bacon|ham|sausages?|chorizo|prosciutto|pancetta|carnitas|pepperoni)\b/],
  ['Turkey', /\bturkey\b/],
  ['Seafood', /\b(shrimp|prawns?|salmon|tuna|cod|tilapia|fish|crab|lobster|scallops?|mussels|clams|halibut|mahi|seafood|catfish|trout)\b/],
];

const TYPE = [
  ['Pasta', /\b(pasta|spaghetti|penne|fettuccine|linguine|rigatoni|lasagna|lasagne|mac(aroni)?( and| &| n'?)? ?cheese|macaroni|ziti|ravioli|tortellini|noodles?|lo mein|alfredo|carbonara|bolognese|orzo|gnocchi|pappardelle|bucatini)\b/],
  ['Sandwiches & Burgers', /\b(sandwich(es)?|burgers?|sliders?|wraps?|panini|subs?|hoagies?|grilled cheese|blt|melts?|sloppy joes?|cheesesteaks?|hot dogs?|po'? ?boy)\b/],
  ['Tacos & Burritos', /\b(tacos?|burritos?|quesadillas?|enchiladas?|fajitas?|nachos|tostadas?|tamales?|taquitos?|chimichangas?|gorditas?|sopes?|flautas?)\b/],
  ['Soups & Stews', /\b(soups?|stews?|chili|chowder|bisque|gumbo|pho|ramen|pozole|minestrone)\b/],
  ['Salads', /\bsalads?\b/],
  ['Pizza', /\b(pizzas?|flatbreads?|calzones?)\b/],
  ['Rice & Bowls', /\b(rice|bowls?|risotto|paella|poke|stir[- ]?fry|jambalaya|biryani)\b/],
  ['Casseroles', /\b(casseroles?|(?<!no[- ])bakes?|hotdish|gratin|au gratin|shepherd'?s pie|cottage pie|pot pie|baked ziti|enchilada bake)\b/],
  ['Baking', /\b(breads?|muffins?|biscuits?|rolls|scones?|loaf|focaccia|bagels?|croissants?|pretzels?|cinnamon rolls?)\b/],
];

// Cooking methods. `anywhere` rules also look at the directions and notes
// ("cook in the slow cooker 8 hours", "freezes well for 3 months").
const METHOD = [
  ['Air Fryer', /\bair[- ]?fr(y|ied|ier|yer|ying)\b/, true],
  ['Slow Cooker', /\b(slow[- ]cook(er|ed)?|crock[- ]?pot)\b/, true],
  ['Instant Pot', /\b(instant pot|pressure[- ]cook(er|ed)?|instapot)\b/, true],
  ['One Pot & Pan', /\bone[- ](pot|pan|skillet)\b/, false],
  ['Sheet Pan', /\bsheet[- ]pan\b/, false],
  ['Grilled', /\b(grill(ed|ing)?|bbq|barbecue|on the grill)\b/, false],
  ['No Cook', /\b(no[- ](cook|bake)|raw)\b/, false],
  ['Meal Prep', /\bmeal[- ]?prep(ped|ping)?\b/, true],
  ['Freezer Friendly', /\b(freezer[- ](friendly|meals?)|freezes? (well|beautifully|great)|(freeze|frozen) for up to|make[- ]ahead and freeze)\b/, true],
];

// Cuisines from the name and the website's own labels (recipeCuisine).
const CUISINE = [
  ['Mexican', /\b(mexican|tex[- ]mex|tacos?|burritos?|quesadillas?|enchiladas?|fajitas?|nachos|tostadas?|tamales?|taquitos?|carnitas|birria|barbacoa|elote|chilaquiles|pozole|mole|al pastor|horchata|carne asada|salsa verde|guacamole|churros?|tres leches|chimichangas?|flautas?|sopes?|gorditas?|esquites|pico de gallo|queso)\b/],
  ['Italian', /\b(italian|tuscan|parmigiana|chicken parm|eggplant parm|marsala|piccata|carbonara|bolognese|lasagna|lasagne|risotto|gnocchi|bruschetta|caprese|pesto|marinara|margherita|tiramisu|focaccia|minestrone|osso buco|cacio e pepe|arrabbiata|puttanesca|calzones?|ziti|cannoli|panna cotta|saltimbocca|ravioli|tortellini|pappardelle|bucatini|orecchiette|gelato|arancini|polenta|alla vodka|amatriciana)\b/],
  ['Chinese', /\b(chinese|lo mein|chow mein|kung pao|general tso'?s?|orange chicken|sesame chicken|fried rice|dumplings?|potstickers?|mapo|char siu|wontons?|egg rolls?|sweet and sour|mongolian|beef and broccoli|szechuan|sichuan|dan dan|bao|bok choy|hoisin|cantonese|chop suey|egg drop|hunan)\b/],
  ['Japanese', /\b(japanese|teriyaki|ramen|sushi|katsu|miso|udon|tempura|yakitori|gyoza|donburi|onigiri|okonomiyaki|karaage|soba|yakisoba|tonkatsu|matcha|mochi|furikake|sukiyaki|chirashi)\b/],
  ['Korean', /\b(korean|bulgogi|bibimbap|kimchi|gochujang|japchae|galbi|kalbi|tteokbokki|gochugaru|kimbap|bossam|dakgalbi|jjigae|mandu)\b/],
  ['Thai', /\b(thai|pad thai|pad see ew|pad kra pao|tom yum|tom kha|green curry|red curry|yellow curry|massaman|panang|penang|larb|khao soi|drunken noodles|satay|mango sticky rice)\b/],
  ['Vietnamese', /\b(vietnamese|pho|banh mi|bun cha|bun bo|goi cuon|spring rolls?|vermicelli bowls?|lemongrass)\b/],
  ['Indian', /\b(indian|tikka|masala|(?<!(garlic|honey|lemon|brown|herb|cajun) )butter chicken|biryani|korma|vindaloo|dal|dhal|daal|paneer|naan|samosas?|chana|chole|saag|palak|tandoori|aloo|curry|chutney|raita|pakoras?|dosa|idli|rogan josh|jalfrezi|keema|lassi)\b/],
  ['Mediterranean', /\b(mediterranean|greek|gyros?|souvlaki|tzatziki|falafel|shawarma|hummus|tabbouleh|moussaka|spanakopita|kebabs?|kabobs?|middle eastern|lebanese|turkish|shakshuka|za'?atar|pita|baba ganoush|fattoush|dolmas?|halloumi|orzo salad|baklava|kofta)\b/],
  ['Cajun & Southern', /\b(cajun|creole|gumbo|jambalaya|[eé]touff[eé]e|po'? ?boys?|southern|biscuits and gravy|shrimp and grits|collard greens?|hush ?puppies|cornbread|fried green tomatoes|red beans and rice|chicken and waffles|chicken (and|&|n'?) ?dumplings|boudin|crawfish|chicken fried steak|country fried|dirty rice|pimento cheese|peach cobbler|banana pudding)\b/],
];

const MEAL = [
  ['Breakfast', /\b(breakfast|brunch|pancakes?|waffles?|french toast|omelet(te)?s?|frittata|scrambled eggs|eggs benedict|oatmeal|overnight oats|granola|hash ?browns?|crepes?|shakshuka)\b/],
  ['Dessert', /\b(desserts?|cakes?|cupcakes?|cookies?|brownies?|pies?|cheesecake|pudding|ice cream|tarts?|fudge|cobbler|crisp|blondies?|truffles?|tiramisu|macarons?|donuts?|doughnuts?|churros?|banana bread)\b/],
  ['Snack', /\b(snacks?|dips?|appetizers?|bites|popcorn|trail mix|energy balls?|hummus|guacamole|salsa)\b/],
  ['Side Dish', /\b(side dish|sides|coleslaw|mashed potatoes|roasted vegetables|garlic bread|pilaf|cornbread|green beans|roasted potatoes|mac and cheese bites)\b/],
  ['Drinks', /\b(smoothies?|lemonade|cocktails?|latte|coffee|iced tea|juice|milkshakes?|punch|margaritas?|mocktails?|sangria|hot chocolate)\b/],
];

// Ingredients like "chicken broth" or "fish sauce" don't make a dish a chicken or fish recipe.
const NOT_THE_PROTEIN = /\b(broth|stock|bouillon|sauce|paste|dressing|seasoning|fat|drippings|gelatin)\b/;

// Suggests categories for a recipe: { name, ingredients, directions, hints }.
export function suggestCategories({ name = '', ingredients = '', directions = '', hints = '', notes = '' } = {}) {
  const title = ` ${String(name).toLowerCase()} `;
  const hint = ` ${String(hints).toLowerCase()} `;
  const body = ` ${String(directions).toLowerCase()} ${String(notes).toLowerCase()} `;
  const lines = parseIngredients(ingredients).filter(p => !p.header).map(p => p.name.toLowerCase());
  const mainIngredients = lines.filter(l => !NOT_THE_PROTEIN.test(l)).join(' | ');
  const out = new Set();

  for (const [cat, re] of TYPE) {
    if (re.test(title) || re.test(hint)) out.add(cat);
  }
  if (!out.has('Pasta') && /\b(spaghetti|penne|fettuccine|linguine|rigatoni|lasagna|macaroni|ziti|ravioli|tortellini|egg noodles|pasta|orzo|gnocchi)\b/.test(mainIngredients)) out.add('Pasta');

  for (const [cat, re, anywhere] of METHOD) {
    // "Grilled cheese" is a sandwich, not a grilling recipe.
    if (cat === 'Grilled' && /grilled cheese/.test(title)) continue;
    if (re.test(title) || re.test(hint) || (anywhere && re.test(body))) out.add(cat);
  }
  for (const [cat, re] of CUISINE) {
    if (re.test(title) || re.test(hint)) out.add(cat);
  }
  // "Chicken and dumplings" is Southern comfort food, not Chinese dumplings.
  if (out.has('Chinese') && /\b(and|&|n'?) ?dumplings\b/.test(title) && !/\bchinese\b/.test(title + hint)) out.delete('Chinese');
  // Curry alone is ambiguous: Thai and Japanese curries aren't Indian.
  if (out.has('Indian') && (out.has('Thai') || out.has('Japanese')) && !/\b(indian|tikka|masala|biryani|korma|vindaloo|dal|paneer|naan|tandoori)\b/.test(title + hint)) out.delete('Indian');

  for (const [cat, re] of PROTEIN) {
    if (re.test(title) || re.test(mainIngredients)) out.add(cat);
  }
  const hasMeat = PROTEIN.some(([cat]) => out.has(cat));

  for (const [cat, re] of MEAL) {
    if (cat === 'Dessert' && hasMeat) continue; // "chicken pot pie" isn't dessert
    if (re.test(title) || re.test(hint)) out.add(cat);
  }
  // Website hints ("Main Course", "Lunch", "Dinner") name the meal directly.
  if (/\blunch\b/.test(hint)) out.add('Lunch');
  if (/\b(dinner|main course|main dish|mains?|entr[eé]es?|supper)\b/.test(hint)) out.add('Dinner');
  if (/\b(dessert|sweets?)\b/.test(hint)) out.add('Dessert');
  if (/\b(breakfast|brunch)\b/.test(hint)) out.add('Breakfast');
  if (/\b(side dish|sides?)\b/.test(hint)) out.add('Side Dish');
  if (/\b(appetizers?|snacks?)\b/.test(hint)) out.add('Snack');
  if (/\b(drinks?|beverages?|cocktails?)\b/.test(hint)) out.add('Drinks');
  if (/\b(vegetarian|vegan|meatless)\b/.test(title + hint)) out.add('Vegetarian');

  const hasMeal = MEAL.some(([cat]) => out.has(cat)) || out.has('Lunch') || out.has('Dinner');
  if (!hasMeal) {
    // Mains with no stated meal: sandwiches and salads lean lunch, other mains dinner.
    if (out.has('Sandwiches & Burgers') || out.has('Salads')) out.add('Lunch');
    else if (hasMeat || ['Pasta', 'Tacos & Burritos', 'Soups & Stews', 'Pizza', 'Rice & Bowls', 'Casseroles', 'Slow Cooker', 'Instant Pot', 'Sheet Pan', 'One Pot & Pan'].some(c => out.has(c))) out.add('Dinner');
  }
  // A meatless main (with enough ingredients listed to be sure) is vegetarian.
  const isMain = out.has('Lunch') || out.has('Dinner');
  if (isMain && !hasMeat && lines.length >= 3 && !lines.some(l => /\b(chicken|beef|pork|bacon|ham|sausage|turkey|fish|anchov|shrimp|gelatin|lard)\b/.test(l))) out.add('Vegetarian');

  // Keep the preset order so chips always appear in the same place.
  return PRESET_CATEGORIES.filter(c => out.has(c));
}
