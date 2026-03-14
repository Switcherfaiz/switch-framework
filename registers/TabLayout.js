/**
 * TabLayout – base class for tab layouts.
 * Extends SwitchComponent. Provides getContentContainer() for framework injection.
 *
 * User defines static: name (tag), tabs, options, screens
 * User overrides: render(), styleSheet(), getContentContainer()
 *
 * Must implement getContentContainer() returning the element where tab screens render.
 */
import { SwitchComponent } from './SwitchComponent.js';

export class TabLayout extends SwitchComponent {
  static tag = 'sw-tabs-layout';
  static initialTab = '';
  static tabs = [];
  static options = {};

  getContentContainer() {
    return this.shadowRoot?.querySelector('.tabcontainer') ?? null;
  }

  static getLayoutConfig() {
    return {
      name: this.tag || 'sw-tabs-layout',
      initialTab: this.initialTab || (this.tabs?.[0]?.name ?? ''),
      tabs: this.tabs || [],
      options: this.options || {},
      screens: this.screens || [],
      layout: 'tabs'
    };
  }
}
