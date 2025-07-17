# Gadget Script Installer

## Структура проекта

- `Gadget-script-installer-core.js` — основной скрипт
- `Gadget-script-installer.js` — загрузчик
- `Gadget-script-installer-core.css` — стили
- `i18n/` — все языковые файлы (JSON)

## Локализация

Все языковые файлы должны находиться в папке `i18n`.

Пример подключения русского языка:
```js
window.SCRIPT_INSTALLER_STRINGS_URL = 'i18n/Gadget-script-installer-core.ru.json';
mw.loader.load('.../Gadget-script-installer-core.js');
```

## Сборка, линтинг и форматирование
(см. package.json, .eslintrc.json, .prettierrc)

--- 