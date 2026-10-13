// Category groups for browsing recipes, and automatic suggestions from a recipe's name,
// ingredients and (for imported recipes) the website's own category hints.

import { parseIngredients } from './ingredients.js';

export const CATEGORY_GROUPS = [
  { name: 'Meal', items: ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Dessert', 'Side Dish', 'Drinks'] },
  { name: 'Protein', items: ['Chicken', 'Beef', 'Pork', 'Turkey', 'Seafood', 'Vegetarian'] },
  { name: 'Type', items: ['Pasta', 'Sandwiches & Burgers', 'Tacos & Mexican', 'Soups & Stews', 'Salads', 'Pizza', 'Rice & Bowls', 'Baking', 'Slow Cooker'] },
];
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
  ['Tacos & Mexican', /\b(tacos?|burritos?|quesadillas?|enchiladas?|fajitas?|nachos|tostadas?|tamales?|carnitas|birria|elote|chilaquiles|mexican|tex[- ]mex|taquitos?)\b/],
  ['Soups & Stews', /\b(soups?|stews?|chili|chowder|bisque|gumbo|pho|ramen|pozole|minestrone)\b/],
  ['Salads', /\bsalads?\b/],
  ['Pizza', /\b(pizzas?|flatbreads?|calzones?)\b/],
  ['Rice & Bowls', /\b(rice|bowls?|risotto|paella|poke|stir[- ]?fry|jambalaya|biryani)\b/],
  ['Baking', /\b(breads?|muffins?|biscuits?|rolls|scones?|loaf|focaccia|bagels?|croissants?|pretzels?|cinnamon rolls?)\b/],
  ['Slow Cooker', /\b(slow cooker|crock ?pot|instant pot|pressure cooker)\b/],
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
export function suggestCategories({ name = '', ingredients = '', directions = '', hints = '' } = {}) {
  const title = ` ${String(name).toLowerCase()} `;
  const hint = ` ${String(hints).toLowerCase()} `;
  const lines = parseIngredients(ingredients).filter(p => !p.header).map(p => p.name.toLowerCase());
  const mainIngredients = lines.filter(l => !NOT_THE_PROTEIN.test(l)).join(' | ');
  const out = new Set();

  for (const [cat, re] of TYPE) {
    if (re.test(title) || re.test(hint)) out.add(cat);
  }
  if (!out.has('Pasta') && /\b(spaghetti|penne|fettuccine|linguine|rigatoni|lasagna|macaroni|ziti|ravioli|tortellini|egg noodles|pasta|orzo|gnocchi)\b/.test(mainIngredients)) out.add('Pasta');
  if (!out.has('Slow Cooker') && /\b(slow cooker|crock ?pot|instant pot|pressure cook)/.test(String(directions).toLowerCase())) out.add('Slow Cooker');

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
    else if (hasMeat || ['Pasta', 'Tacos & Mexican', 'Soups & Stews', 'Pizza', 'Rice & Bowls', 'Slow Cooker'].some(c => out.has(c))) out.add('Dinner');
  }
  // A meatless main (with enough ingredients listed to be sure) is vegetarian.
  const isMain = out.has('Lunch') || out.has('Dinner');
  if (isMain && !hasMeat && lines.length >= 3 && !lines.some(l => /\b(chicken|beef|pork|bacon|ham|sausage|turkey|fish|anchov|shrimp|gelatin|lard)\b/.test(l))) out.add('Vegetarian');

  // Keep the preset order so chips always appear in the same place.
  return PRESET_CATEGORIES.filter(c => out.has(c));
}
