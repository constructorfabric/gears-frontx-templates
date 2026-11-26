import rawStyles from './raw-only.css?raw';
import stylesUrl from './url-only.css?url';

export default {
  mount(container) {
    container.dataset.styles = rawStyles;
    container.dataset.stylesUrl = stylesUrl;
  },
  unmount() {},
};
