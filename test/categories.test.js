import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestCategories, groupOf } from '../js/categories.js';

const s = (name, ingredients = '', extra = {}) => suggestCategories({ name, ingredients, ...extra });

test('protein comes from the name and main ingredients', () => {
  assert.deepEqual(s('Garlic Butter Chicken', '2 lbs chicken thighs\n4 tbsp butter\n6 cloves garlic'), ['Dinner', 'Chicken']);
  assert.deepEqual(s('Weeknight Tacos', '1 lb ground beef\n8 tortillas\n1 cup salsa'), ['Dinner', 'Beef', 'Tacos & Mexican']);
  assert.ok(s('Shrimp Scampi', '1 lb shrimp\n8 oz linguine').includes('Seafood'));
  // Broth, fish sauce etc. don't count as the protein
  const soup = s('Vegetable Soup', '4 cups chicken broth\n2 carrots\n2 potatoes\n1 onion');
  assert.ok(!soup.includes('Chicken'));
  assert.ok(soup.includes('Soups & Stews'));
});

test('dish types', () => {
  assert.ok(s('Creamy Tuscan Pasta').includes('Pasta'));
  assert.ok(s('One Pot Dinner', '1 lb penne\n2 cups marinara\n1 cup mozzarella').includes('Pasta'));
  assert.ok(s('Smash Burgers', '1 lb ground beef').includes('Sandwiches & Burgers'));
  assert.ok(s('Turkey Club Sandwich', '4 slices turkey').includes('Sandwiches & Burgers'));
  assert.ok(s('Margherita Pizza').includes('Pizza'));
  assert.ok(s('Chicken Fried Rice', '2 cups rice\n1 lb chicken').includes('Rice & Bowls'));
  assert.ok(s('Pot Roast', '3 lb chuck roast', { directions: 'Cook in the slow cooker 8 hours.' }).includes('Slow Cooker'));
});

test('meals', () => {
  assert.deepEqual(s('Fluffy Pancakes', '2 cups flour\n2 eggs\n1 cup milk'), ['Breakfast']);
  assert.deepEqual(s('Chewy Chocolate Chip Cookies', '2 cups flour\n1 cup butter'), ['Dessert']);
  assert.ok(s('Grilled Cheese Sandwich', '2 slices bread\n2 slices cheddar\n1 tbsp butter').includes('Lunch'));
  // Pot pie with chicken is dinner, not dessert
  const potPie = s('Chicken Pot Pie', '2 cups chicken\n1 pie crust\n1 cup peas');
  assert.ok(potPie.includes('Chicken') && potPie.includes('Dinner') && !potPie.includes('Dessert'));
  assert.ok(s('Strawberry Banana Smoothie').includes('Drinks'));
});

test('website hints name the meal', () => {
  assert.ok(s('Lemon Orzo', '', { hints: 'Main Course, Italian' }).includes('Dinner'));
  assert.ok(s('Turkey Wrap', '', { hints: 'Lunch' }).includes('Lunch'));
});

test('meatless mains are vegetarian; desserts are not tagged vegetarian', () => {
  assert.ok(s('Black Bean Tacos', '2 cans black beans\n8 tortillas\n1 avocado\n1 lime').includes('Vegetarian'));
  assert.ok(!s('Brownies', '1 cup butter\n2 eggs\n1 cup sugar\n1 cup flour').includes('Vegetarian'));
  // Not enough ingredients to be sure
  assert.ok(!s('Mystery Tacos').includes('Vegetarian'));
});

test('groups', () => {
  assert.equal(groupOf('Chicken'), 'Protein');
  assert.equal(groupOf('Dinner'), 'Meal');
  assert.equal(groupOf('Grandma’s'), 'My Categories');
});
