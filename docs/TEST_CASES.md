# MRH StoreFront — Automated Test Cases

Each test case below is automated in `e2e-appium/test/specs/` and runs on both
Android and iOS. The steps are written exactly as they appear in the test
reports (console, Allure, Azure DevOps "Tests" tab).

**How to read them:** *Given* sets up the starting point, *When* is what the
customer does, *Then* is what must be true afterwards. Every scenario prepares
its own starting point, so any test can be run on its own and in any order.

| # | Feature | Scenario | Tags | Signed in? | Spec |
|---|---|---|---|---|---|
| TC-01 | Login | A customer signs in and sees the full Home page | smoke | Signs in | `login.e2e.ts` |
| TC-02 | Shop navigation | The Shop menu shows the Category and Function sections | smoke | No | `navigation.e2e.ts` |
| TC-03 | Cart management | Add a searched product to the cart and remove it | smoke | No | `cart.e2e.ts` |
| TC-04 | Quantity and promotions | Change an item's quantity and try an invalid coupon | regression | No | `quantity-promotions.e2e.ts` |
| TC-05 | Wishlist management | Create a list, save a product to it, and move it to the cart | regression | Yes | `wishlist.e2e.ts` |
| TC-06 | Cleanup | Empty the cart and delete the test list | regression | Yes | `cleanup.e2e.ts` |
| TC-07 | Logout | A signed-in customer signs out | smoke | Yes | `logout.e2e.ts` |

A full run executes them in this order. The `smoke` suite is TC-01, 02, 03 and 07.

---

## TC-01 · Login

**Scenario: A customer signs in and sees the full Home page**

```gherkin
Given I am a guest on the Account page
When I open the Sign In screen
And I sign in with valid customer credentials
Then my Account page shows my email address
When I open the Home tab
Then the Home page shows every key section
     (top banner, hero search bar, top categories, product shelf, brand footer)
```

Notes
- Other sections (announcement banner, What's New, Recently viewed, Purchase
  again…) depend on CMS content and the customer's history. They are listed in
  the report but do not fail the test.
- The customer is signed out again afterwards.

---

## TC-02 · Shop navigation

**Scenario: The Shop menu shows the Category and Function sections**

```gherkin
Given the app is open on the Home tab
When I tap the Shop tab
Then the Shop page loads with its title and Quick Shop links
And the "Shop by" section offers Category and Function tabs
And the Category tab is selected and lists categories
When I tap the Function tab
Then the Function tab is selected and lists functions
```

---

## TC-03 · Cart management

**Scenario: Add a searched product to the cart and remove it**

```gherkin
Given my cart is empty
When I search for "lavender" and open the first in-stock result
And I add it to my cart
Then the cart badge shows 1 item
And my cart lists that product
When I remove the product from my cart
Then my cart is empty
And the cart badge shows no items
```

---

## TC-04 · Quantity and promotions

**Scenario: Change an item's quantity and try an invalid coupon**

```gherkin
Given my cart is empty
And I have added a "lavender" product to my cart
When I increase the item's quantity
Then the quantity goes up by one and the cart badge matches
When I decrease the item's quantity
Then the quantity goes back down and the cart badge matches
When I apply the invalid coupon code "E2E-NOT-A-REAL-CODE"
Then I see a message that the coupon is invalid
And no coupon is applied to my cart
```

Notes
- Each quantity change is saved to the store before the next step runs.
- The expected message is "The applied coupon code is invalid."
- The cart is emptied afterwards.

---

## TC-05 · Wishlist management

**Scenario: Create a list, save a product to it, and move it to the cart**

```gherkin
Given I am signed in as a customer
And my cart is empty
And no test lists are left over from earlier runs
When I create a new list named "E2E List <unique id>"
Then the list appears in My Lists with no items
When I search for "lavender" and save the first result to my new list
Then the list shows 1 item
When I open the list
Then it contains that product
When I move the product to my cart
Then the cart badge shows 1 item
And my cart contains that product
```

Notes
- Test lists always start with "E2E List", so the suite never touches a
  customer's real lists.
- "Move to cart" is the list's quick-add button: the product is added to the
  cart and stays on the list.
- The cart item and the list are deliberately left in place for TC-06.

---

## TC-06 · Cleanup

**Scenario: Empty the cart and delete the test list**

```gherkin
Given I am signed in as a customer
And my cart has at least one product
And a test list exists in My Lists
When I remove every product from my cart
Then my cart is empty and the cart badge shows no items
When I delete the test list
Then the list no longer appears in My Lists
```

Notes
- After TC-05, the *Given* steps simply find what TC-05 left. Run on its own,
  they add a product and create a list first.
- Every list starting with "E2E List" is deleted, including leftovers from an
  interrupted run.

---

## TC-07 · Logout

**Scenario: A signed-in customer signs out**

```gherkin
Given I am signed in as a customer
When I tap Sign Out on the Account page
Then the Account page shows the guest view with a Sign In button
And my account details are no longer shown
And I am still signed out after restarting the app
```

---

## Retries

A failing test is retried up to **2 times** (`TEST_RETRIES`, default 2). Before
each retry the app is restarted, so the retry starts from a clean screen rather
than wherever the failed attempt stopped. A test only fails the run if all three
attempts fail. Screenshots and the on-screen element tree are saved for every
failed attempt.

## Test data

| Data | Default | Setting |
|---|---|---|
| Customer account | — (secret) | `TEST_USER_EMAIL`, `TEST_USER_PASSWORD` |
| Search term (must return an in-stock product) | `lavender` | `SEARCH_TERM` |
| Invalid coupon code | `E2E-NOT-A-REAL-CODE` | `INVALID_COUPON_CODE` |
| Test list name prefix | `E2E List` | `test/data/catalog.ts` |

Carts and lists are stored on the server per account. Run the signed-in
scenarios (TC-05, TC-06) on one device at a time per account.
