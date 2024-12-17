const fs = require('fs');
const sexpr = require('s-expression');

// Read the input file
const inputFile = 'proof.txt'; // Replace with your input file name
const inputString = fs.readFileSync(inputFile, 'utf8');

// Parse the S-expression
const parsedData = sexpr(inputString);
console.log(parsedData);
const [a, b, c] = parsedData;
console.log(a, b, c);

// Function to build the output object
function buildObject(ast) {
    if (Array.isArray(ast)) {
        // If the list is empty, return an empty array
        if (ast.length === 0) {
            return [];
        }

        // If the list represents a key-value mapping
        if (isKeyValueMapping(ast)) {
            let obj = {};
            for (let i = 0; i < ast.length; i += 2) {
                let key = ast[i];
                let value = buildObject(ast[i + 1]);
                obj[key] = value;
            }
            return obj;
        } else {
            // Otherwise, it's an array or a tuple
            return ast.map(item => buildObject(item));
        }
    } else if (typeof ast === 'string') {
        // Handle boolean strings
        if (ast === 'true') {
            return true;
        } else if (ast === 'false') {
            return false;
        }
        // Check if it's a hexadecimal number
        if (/^[0-9A-Fa-f]+$/.test(ast)) {
            return '0x' + ast.toUpperCase();
        } else if (/^0x[0-9A-Fa-f]+$/.test(ast)) {
            return ast.toUpperCase();
        } else {
            return ast;
        }
    } else {
        // Return other types as is
        return ast;
    }
}

function isKeyValueMapping(list) {
    // A key-value mapping must have an even number of elements
    if (list.length % 2 !== 0) {
        return false;
    }
    // Keys must be strings
    for (let i = 0; i < list.length; i += 2) {
        if (typeof list[i] !== 'string') {
            return false;
        }
    }
    return true;
}

// Function to process specific keys
function postProcess(data) {
    if (Array.isArray(data)) {
        // Process each element in the array
        return data.map(item => postProcess(item));
    } else if (typeof data === 'object' && data !== null) {
        let newData = {};
        for (let key in data) {
            if (data[key] === null || data[key] === undefined) {
                newData[key] = data[key];
            } else if (typeof data[key] === 'object') {
                newData[key] = postProcess(data[key]);
            } else {
                newData[key] = data[key];
            }
        }
        return newData;
    } else {
        return data;
    }
}

const outputData = buildObject(parsedData);
const processedData = postProcess(outputData);

// Write the output as JSON
const outputFile = 'output.json'; // Replace with your desired output file name
fs.writeFileSync(outputFile, JSON.stringify(processedData, null, 2));

console.log('JSON output has been written to', outputFile);
