const URL = 'https://restcountries.com/v3.1';

async function getData(url) {
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
        redirect: 'follow',
    });
    return response.json();
}

// для преобразования базы в словарь вида caa3/данные страны. Используем для того, чтобы не бегать за странами на бэк
async function loadCountriesData() {
    const countries = await getData(`${URL}/all?fields=name&fields=cca3&fields=area`);
    return countries.reduce((result, country) => {
        result[country.cca3] = country;
        return result;
    }, {});
}

async function getBorders(code, requestData) {
    try {
        const borders = await getData(`${URL}/alpha/${code}?fields=borders`);

        if (!borders) {
            throw new Error(borders.message); // попадёт в catch если произошла ошибка
        }
        return borders.borders;
    } catch (err) {
        requestData.error = true;
        return err;
    }
}

// тут весь мозг данной работы, ищем маршруты либо записываем ответы с ошибками
async function search(searchData, paths, requestData) {
    // обернём всё в try/catch для безопасности
    try {
        for await (const path of paths) {
            const rootPath = path.path.at(-1);

            // если мы находим наш путь
            if (rootPath === searchData.end) {
                searchData.resultPaths.push(path.path);

                // теперь поищем другие варианты, если они есть (тоже самое количество шагов)
                for (let i = paths.indexOf(path) + 1; i < paths.length; i++) {
                    if (paths[i].step === path.step && paths[i].path.at(-1) === searchData.end) {
                        searchData.resultPaths.push(paths[i].path);
                    }
                }
                break;
            } else if (path.step > 10) {
                searchData.overLimit = true;
                return 'Очень далеко... давай на самолёте?)';
            } else {
                const borders = await getBorders(rootPath, requestData);
                requestData.requestCounter += 1; // увеличиваем счётчик запросов

                if (requestData.error) {
                    return borders;
                }

                // фильтруем страны, чтобы не идти по кругу
                const nextBorders = borders.filter((border) => {
                    for (let i = 0; i < paths.length; i++) {
                        if (paths[i].path.at(-1) === border) {
                            if (paths[i].step <= path.step) {
                                return false;
                            }
                        }
                    }
                    return true;
                });

                nextBorders.forEach((border) => {
                    const newPath = {};
                    newPath.path = path.path.concat(border);
                    newPath.step = path.step + 1;
                    paths.push(newPath); // вот тут спрятано увеличения стека, путём мутирования paths
                });
            }
        }
        return searchData.resultPaths;
    } catch (err) {
        searchData.error = true;
        return err;
    }
}

const form = document.getElementById('form');
const fromCountry = document.getElementById('fromCountry');
const toCountry = document.getElementById('toCountry');
const countriesList = document.getElementById('countriesList');
const submit = document.getElementById('submit');
const output = document.getElementById('output');

// функция для блокировки/разблокировке полей ввода и кнопки сабмита
const tooggleForm = (bollean) => {
    fromCountry.disabled = bollean;
    toCountry.disabled = bollean;
    submit.disabled = bollean;
};

(async () => {
    tooggleForm(true); // дизейблим кнопки во время запроса

    output.textContent = 'Loading…';
    const countriesData = await loadCountriesData();
    output.textContent = '';

    // немного поменял код, чтобы дважды не делать Object.keys, ключи ещё понадобятся
    const countryCodes = Object.keys(countriesData);

    // Заполняем список стран для подсказки в инпутах
    countryCodes
        .sort((a, b) => countriesData[b].area - countriesData[a].area)
        .forEach((code) => {
            const option = document.createElement('option');
            option.value = countriesData[code].name.common;
            countriesList.appendChild(option);
        });

    tooggleForm(false); // делаем раздизейбл по окончании запроса

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        // функция для поиска нужного ключа cca3
        const getCountryCode = (contryFullName) =>
            countryCodes.find((cca3) => contryFullName === countriesData[cca3].name.common);

        // ниже подобие примитивной валидации, не дающей сделать запрос по пустому полю
        if (!fromCountry.value) {
            output.textContent = 'Поле "From" должно быть заполнено:)';
            fromCountry.focus();
        } else if (!toCountry.value) {
            output.textContent = 'Поле "To" должно быть заполнено:)';
            toCountry.focus();
        } else {
            (async () => {
                tooggleForm(true);

                output.textContent = 'Ищем оптимальные маршруты, подождите пожалуйста!';

                const searchData = {
                    start: getCountryCode(fromCountry.value),
                    end: getCountryCode(toCountry.value),
                    resultPaths: [], // результат отработки нашей функции, его мы будем парсить в дальнейшем
                    overLimit: false, // если страны слишком далеко друг от друга - мы выведем в ответ информацию об этом
                    error: false, // если возникнет ошибка - поменяем данный флаг и выведем в output информацию об этом
                };

                const paths = [{ path: [searchData.start], step: 1 }]; // это будет массив различных версий пути, ведь их может быть несколько

                const requestData = {
                    requestCounter: 0, // наш счётчик запросов OK
                    error: false, // если возникнет ошибка во время выполнения запросов - выведем её
                };

                const resultOutput = await search(searchData, paths, requestData); // вызов главной функции

                if (requestData.error) {
                    output.textContent = `Произошла ошибка при обращении к серверу ${resultOutput}`;
                } else if (searchData.error) {
                    output.textContent = `Произошла неизвестная ошибка, уже фиксим! ${resultOutput}`;
                } else if (searchData.overLimit) {
                    output.textContent = resultOutput;
                } else if (searchData.resultPaths.length) {
                    output.textContent = '';
                    resultOutput.forEach((path) => {
                        path.forEach((country, i) => {
                            path[i] = countriesData[country].name.common;
                        });
                        output.innerHTML += `${path.join(' → ')}<br/>`;
                    });
                    output.innerHTML += `Количество запросов к API: ${requestData.requestCounter}`;
                } else {
                    output.textContent = 'Путь не найден:(';
                }

                tooggleForm(false);
            })();
        }
    });
})();
