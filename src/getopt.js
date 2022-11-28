function verifySchema(schema) {
  // TODO check the format of schema and feedback the malform detail
}

function verifyArgs(schema, args) {
  // TODO verify the args followed the schema definition
  // /^-\w=.*$/.test(arg)
}

function rPad(string, length) {
  let pad = '';
  for (let i = string.length; i < length; i++) {
    pad += ' ';
  }
  return string + pad;
}

function getSchemaItemByShort(schema, short) {
  return schema.find(item => item[0] === short);
}

function getSchemaItemByLong(schema, long) {
  return schema.find(item => item[1].split('=')[0] === long);
}

function getOptionSettingBySchemaItem(schemaItem) {
  let schemaLong = schemaItem[1];
  if (!schemaLong) {
    let key = schemaItem[0];
    return { key, short: key, long: '', expectingValue: false };
  }
  if (/(.*)=ARG\+?$/.test(schemaLong)) {
    let key = schemaLong.substring(0, schemaLong.indexOf('='));
    return {
      key, short: schemaItem[0], long: key,
      expectingValue: true,
      expectingMultipleValue: schemaLong[schemaLong.length - 1] === '+'
    };
  }
  return { key: schemaLong, short: schemaItem[0], long: schemaLong, expectingValue: false };
}

function parseAsMultipleShorts(schema, arg) {
  let result = {};
  // test if it looks like a multiple shorts
  if (!/^-\w\w.*/.test(arg)) {
    return null;
  }
  // test if it looks correct as a multiple shorts
  if (!/^-\w+$/.test(arg)) {
    throw new Error(`Malformed argument: ${arg}`);
  }
  // parse each character as a 'true'
  for (let i = 1; i < arg.length; i++) {
    let short = arg.charAt(i);
    let schemaItem = getSchemaItemByShort(short);
    if (!schemaItem) {
      throw new Error(`Unrecognized argument: ${short} in ${arg}`);
    }
    let schemaLong = schemaItem[1];
    if (/(.*)=ARG\+?$/.test(schemaLong)) {
      let long = schemaLong.substring(0, schemaLong.indexOf('='));
      throw new Error(`Argument: ${short} in ${arg} (short for ${long}) can't be used this way because it needs a value. Use -${short} <value> or --${long}=<value> instead.`);
    }
    result[schemaLong || short] = true;
  }
  return result;
}

function parseAsOption(schema, arg) {
  let key, expectingValue = false;
  if (/^-\w$/.test(arg)) {
    let short = arg[1];
    let schemaItem = getSchemaItemByShort(schema, short);
    if (!schemaItem) {
      throw new Error(`Unrecognized argument: ${arg}`);
    }
    return { ...getOptionSettingBySchemaItem(schemaItem) };
  } else if (/^--\w[^=]*$/.test(arg)) {
    let long = arg.slice(2);
    let schemaItem = getSchemaItemByLong(schema, long);
    if (!schemaItem) {
      throw new Error(`Unrecognized argument: ${arg}`);
    }
    return { ...getOptionSettingBySchemaItem(schemaItem) };
  } else if (/^--\w.*$/.test(arg)) {
    let [key, value] = arg.slice(2).split('=');
    let schemaItem = getSchemaItemByLong(schema, key);
    if (!schemaItem) {
      throw new Error(`Unrecognized argument: ${arg}`);
    }
    let optionSetting = getOptionSettingBySchemaItem(schemaItem);
    if (optionSetting.expectingValue) {
      return { key, value, expectingValue: false };
    } else {
      if (value !== 'true' && value !== 'false') {
        throw Error(`Binary option ${key} accepts only true/false value`);
      }
      // TODO if the option is not expecting value, to constrait it true/false or let it be?
      return { key, value: value !== 'false', expectingValue: false };
    }
  } else {
    return null;
  }
}

class GetOpt {

  schema;
  autoShowHelp = false;

  constructor(schema) {
    verifySchema(schema);
    this.schema = schema;
  }

  bindHelp(appName = '') {
    this.autoShowHelp = true;
    this.appName = appName;
    let schemaItem = getSchemaItemByLong(this.schema, 'help');
    if (!schemaItem) {
      this.schema = [
        ...this.schema,
        ['h', 'help', 'display this help content']
      ];
    }
    return this;
  }

  parse(args) {
    let arr = [...args];
    let previousOption, current;
    let result = { options: {}, values: [] };
    while (arr.length) {
      current = arr.shift();
      let multipleShorts = parseAsMultipleShorts(this.schema, current);
      if (multipleShorts) {
        if (previousOption?.expectingValue) {
          throw new Error(`Option '${previousOption.key}' is expecting a value but get other options: ${current}`);
        }
        result.options = { ...result.options, ...multipleShorts };
        previousOption = null;
        continue;
      }
      let option = parseAsOption(this.schema, current);
      if (option) {
        if (previousOption?.expectingValue) {
          throw new Error(`Option '${previousOption.key}' is expecting a value but get another option: ${current}`);
        }
        if (Object.prototype.hasOwnProperty.call(option, 'value')) {
          if (option.expectingMultipleValue) {
            result.options[option.key] = [...result.options[option.key] || [], option.value];
          } else if (!Object.prototype.hasOwnProperty.call(result.options, option.key)) {
            result.options[option.key] = option.value;
          } else {
            if (result.options[option.key] !== option.value) {
              throw new Error(`Option '${option.key}' settig with ambiguity values: ${result.options[option.key]}, ${option.value}`);
            }
          }
        } else if (!option.expectingValue) {
          if (!Object.prototype.hasOwnProperty.call(result.options, option.key)) {
            result.options[option.key] = true;
          } else {
            if (result.options[option.key] === false) {
              throw new Error(`Option '${option.key}' settig with ambiguity values: true, false`);
            }
          }
        }
        previousOption = option;
        continue;
      }
      if (previousOption?.expectingValue) {
        let option = { ...previousOption, value: current };
        if (!Object.prototype.hasOwnProperty.call(result.options, option.key)) {
          result.options[option.key] = option.value;
        } else {
          if (result.options[option.key] !== option.value) {
            throw new Error(`Option '${option.key}' settig with ambiguity values: ${result.options[option.key]}, ${option.value}`);
          }
        }
        previousOption = null;
        continue;
      }
      result.values.push(current);
    }
    if (previousOption?.expectingValue) {
      throw new Error(`Option '${previousOption.key}' is expecting a value`);
    }
    if (this.autoShowHelp && result.options.help) {
      this.showHelp();
      process.exit(0);
    }
    return result;
  }

  getHelp(appName = '') {
    appName = appName || this.appName;
    let maxlong = Math.max.apply(Math, this.schema.map(item => item[1].length + 8));
    let prompt = appName ? `usage: ${appName} ` : 'arguments: ';
    let opts = [], options = [];
    let optsLines = [], optionsLines = ['options details:'];
    this.schema.forEach(item => {
      let optionSetting = getOptionSettingBySchemaItem(item);
      let oshort = '', olong = '';
      if (optionSetting.short) {
        oshort = `-${optionSetting.short}`;
      }
      if (optionSetting.long) {
        olong = `--${optionSetting.long}${optionSetting.expectingValue ? '=<value>' : ''}`;
      }
      opts.push(`[ ${[oshort, olong].filter(x => x).join(' | ')} ]`);
      options.push([
        rPad(item[0] ? `-${item[0]},` : '', 4),
        rPad(item[1] ? `--${item[1].replace('ARG+', '<value>').replace('ARG', '<value>')},` : '', maxlong),
        item[2]
      ].join(''));
    });
    for (let i = 0; i < options.length; i++) {
      if (i % 4 === 0) {
        if (Math.floor(i / 4) === 0) {
          optsLines.push(prompt + opts[i]);
        } else {
          optsLines.push(rPad('', prompt.length) + opts[i]);
        }
      } else {
        optsLines[optsLines.length - 1] += ` ${opts[i]}`;
      }
      optionsLines.push(rPad('', 2) + options[i]);
    }
    return [...optsLines, ...optionsLines];

  }

  showHelp(appName = '') {
    let lines = this.getHelp(appName);
    lines.forEach(line => console.log(line));
  }
}

export default {
  create: function (schema) {
    return new GetOpt(schema);
  }
};