const inquirer = require('inquirer')
const pathToRegexp = require('path-to-regexp')
const path = require('path')
const fs = require('fs-extra')
const { lowerCase } = require('lodash')
const prettier = require('prettier')

const rootPath = path.resolve(process.cwd())

async function extractVariables(pathPattern) {
  const keys = []
  pathToRegexp(pathPattern, keys)

  const pathVars = {}

  for (let key of keys) {
    const relativePath = pathToRegexp.compile(pathPattern.split(`:${key.name}`)[0])(pathVars)
    const fullPath = path.resolve(rootPath, relativePath)

    const shouldBeNew = key.name.startsWith('new')
    const keyName = key.name.replace(/^new/, '')
    const humanizedKeyName = lowerCase(keyName)

    const choices = fs.existsSync(fullPath) && fs.readdirSync(fullPath).filter(it => new RegExp(`^${key.pattern}$`).test(it))

    const validate = value => {
      const isValidName = new RegExp(`^${key.pattern}$`).test(value)
      return shouldBeNew && fs.existsSync(`${fullPath}/${value}`)
        ? `This ${humanizedKeyName} already exists`
        : isValidName || `Please enter a valid ${humanizedKeyName} name!`
    }

    const { variable } = await inquirer.prompt([
      {
        type: !shouldBeNew && fs.existsSync(fullPath) ? 'list' : 'input',
        name: 'variable',
        message: `Which ${humanizedKeyName}?`,
        choices,
        validate,
      },
    ])

    pathVars[key.name] = variable
  }

  return pathVars
}

async function runGenerator(config) {
  const context = {}

  for (let q of config.questions) {
    if (q.type === 'path') {
      let chosenKind = Object.keys(q.choices)[0]

      if (Object.keys(q.choices).length > 1) {
        const { kind } = await inquirer.prompt([
          {
            type: 'list',
            name: 'kind',
            message: q.message,
            choices: Object.keys(q.choices),
          },
        ])

        chosenKind = kind
      }

      let chosenPathPattern = q.choices[chosenKind]
      let pathVariables = await extractVariables(chosenPathPattern)

      context[q.name] = {
        ...pathVariables,
        interpolated: path.resolve(rootPath, pathToRegexp.compile(chosenPathPattern)(pathVariables)),
      }
    } else {
      const answer = await inquirer.prompt([q])
      context[q.name] = answer[q.name]
    }
  }

  config.files.forEach(getFileConfig => {
    const { path: filePath, content } = getFileConfig(context)

    if (!filePath) return

    fs.ensureFileSync(filePath)
    fs.writeFileSync(filePath, prettier.format(content, { filepath: filePath }), {
      encoding: 'utf8',
    })

    console.log(`Created ${filePath}`)
  })
}

exports.runGenerators = async (generatorsConfig) => {
  if (Object.keys(generatorsConfig).length === 1)
    return runGenerator(Object.values(generatorsConfig)[0])

  const { generatorName } = await inquirer.prompt([
    {
      type: 'list',
      name: 'generatorName',
      message: 'Which generator do you wanna run?',
      choices: Object.keys(generatorsConfig),
    },
  ])

  return runGenerator(generatorsConfig[generatorName])
}