var cowsay = require("cowsay");

function print() {
    return cowsay.say({
        text: "Hello World!"
    });
}

console.log(print());
