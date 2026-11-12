/**
 * Given / When / Then step helpers.
 *
 * Each call is a named step in the console and the Allure report, so a run
 * reads like the scenario it automates:
 *
 *   await Given('I am signed in as a customer', () => AuthFlow.signIn(users.customer));
 *   await When('I add the product to my cart', () => ProductDetailScreen.addToCart());
 *   await Then('the cart badge shows 1 item', () => TabBar.waitForCartCount(1));
 *
 * Steps return the body's value, so data can flow between them.
 */
import { step } from './reporting';

type Body<T> = () => Promise<T>;

export const Given = <T>(text: string, body: Body<T>) => step(`Given ${text}`, body);
export const When = <T>(text: string, body: Body<T>) => step(`When ${text}`, body);
export const Then = <T>(text: string, body: Body<T>) => step(`Then ${text}`, body);
export const And = <T>(text: string, body: Body<T>) => step(`And ${text}`, body);
