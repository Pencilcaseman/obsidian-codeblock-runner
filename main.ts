import {
	App,
	MarkdownPostProcessorContext,
	MarkdownView,
	Notice,
	Plugin,
	PluginManifest
} from "obsidian";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const highlighter = new (require("ansi-to-html"));

type Language = {
	extensions: Array<string>
	id: string
	monaco: string
	name: string
};

type Compiler = {
	compilerType: string
	id: string
	instructionSet: string
	lang: string
	name: string
	semver: string
};

type CompileResult = {
	buildResult: {
		code: number
		compilationOptions: Array<string>
		downloads: Array<string>
		executableFilename: string
		stderr: Array<{ text: string }>
		stdout: Array<{ text: string }>
		timedOut: boolean
	},
	code: number,
	didExecute: boolean,
	execTime: string,
	okToCache: boolean,
	processExecutionResultTime: number,
	asm?: Array<{ text: string }>,
	stderr: Array<{ text: string }>,
	stdout: Array<{ text: string }>,
	timedOut: boolean
};

let languages: [{
	extensions: Array<string>
	id: string
	monaco: string
	name: string
}];

let compilers: [
	{
		compilerType: string
		id: string
		instructionSet: string
		lang: string
		name: string
		semver: string
	}
];

const defaultCompilers = [
	{language: "c++", compiler: "g122"},
	{language: "c", compiler: "g122"},
	{language: "cuda", compiler: "nvcc117"},
	{language: "csharp", compiler: "dotnet700csharp"},
	{language: "rust", compiler: "r1650"},
	{language: "assembly", compiler: "llvmas700"},
	{language: "python", compiler: "python311"},
	{language: "haskell", compiler: "ghc922"},
];

const languageAliases = [
	{language: "c++", aliases: ["cpp", "cplusplus", "cc"]},
	{language: "c", aliases: ["c"]},
	{language: "cuda", aliases: ["cuda", "cu"]},
	{language: "csharp", aliases: ["csharp", "cs"]},
	{language: "rust", aliases: ["rust", "rs"]},
	{language: "assembly", aliases: ["assembly", "asm"]},
	{language: "python", aliases: ["python", "py"]},
	{language: "haskell", aliases: ["hs"]}
];

interface CodeRunnerSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: CodeRunnerSettings = {
	mySetting: "default"
}

export default class CodeRunnerPlugin extends Plugin {
	settings: CodeRunnerSettings;

	constructor(app: App, pluginManifest: PluginManifest) {
		super(app, pluginManifest);
	}

	async onload() {
		await this.loadSettings();

		// Load the available languages and compilers
		languages = await getLanguages();
		compilers = await getCompilers();

		console.log("Languages:", languages);
		console.log("Compilers:", compilers);

		// Register the CodeBlock formatter
		this.registerMarkdownPostProcessor((element, context) => {
			codeBlockProcessor(element, context, this.app, this);
		});
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

function codeBlockProcessor(element: HTMLElement,
							context: MarkdownPostProcessorContext,
							app: App,
							plugin: CodeRunnerPlugin) {
	const codeBlocks = element.querySelectorAll("code");

	for (let i = 0; i < codeBlocks.length; i++) {
		// Try catch is not ideal, but it both reduces errors and simplifies the code
		try {
			const codeBlock = codeBlocks[i];
			if (codeBlock.classList.contains("has-codeblock-runner-button")) {
				return;
			} else {
				codeBlock.classList.add("has-codeblock-runner-button");
			}

			let language = "NONE";
			codeBlock.classList.forEach(property => {
				if (property.startsWith("language-")) {
					language = property.substring("language-".length);
				}
			});

			const configMatch = codeBlock.innerText
				.match(/<compile>([\s\S]*?)<\/compile>/);
			let programSource = codeBlock.innerText;
			if (configMatch) {
				programSource = programSource.substring(programSource.indexOf("</compile>") + "</compile>".length);
			}

			const config = configMatch
				? JSON.parse(configMatch[0].substring("<compile>".length, configMatch[0].length - "</compile>".length))
				: {language: language};
			const fullConfig = generateProgramConfig(programSource, config);

			// Block is not a valid language
			if (!fullConfig) {
				continue;
			}

			const button = document.createElement("button");
			button.className = "codeblock-runner-button";
			button.type = "button";
			button.innerText = "Run Code Block";
			element.children[0].insertBefore(button, element.children[0].children[0]);

			button.addEventListener("click", () => {
				button.innerText = "Running...";
				const compileResult = compileProgramConfig(fullConfig);
				compileResult.then(result => {
					let lines: Array<{ text: string }>;
					if (result.asm) {
						// @ts-ignore
						lines = [].concat(result.stderr, result.stdout, result.asm);
					} else {
						// @ts-ignore
						lines = [].concat(result.buildResult.stdout, result.buildResult.stderr, result.stdout, result.stderr);
					}

					console.log(result);

					element.querySelector(".codeblock-runner-output")?.remove();
					const maxLineNumberLength = lines.length.toString().length;
					const output = element.children[element.children.length - 1].createEl("div", {cls: "codeblock-runner-output"});

					const closeButton = document.createElement("button");
					closeButton.className = "codeblock-runner-close-button";
					closeButton.type = "button";
					closeButton.innerText = "Close";
					closeButton.addEventListener("click", () => {
						element.querySelector(".codeblock-runner-output")?.remove();
					});
					output.appendChild(closeButton);

					const execTime = parseInt(result.execTime);
					const runtime = output.createEl("div", {cls: "codeblock-runner-output-line"});
					runtime.createEl("p", {cls: "codeblock-runner-output-runtime-tag"}).setText(" ".repeat(maxLineNumberLength + 1) + "Program Runtime:");
					runtime.createEl("p", {cls: "codeblock-runner-output-runtime-value"}).setText(execTime.toString().substring(0, Math.min(execTime.toString().length, 6)));
					runtime.createEl("p", {cls: "codeblock-runner-output-runtime-tag"}).setText("ms");
					let lineNumber = 0;
					for (const line of lines) {
						lineNumber++;
						let lineText = lineNumber.toString();
						lineText = lineText.padStart(maxLineNumberLength, "0");

						const div = output.createEl("div", {cls: "codeblock-runner-output-line"});
						div.createEl("p", {cls: "codeblock-runner-output-text codeblock-runner-output-line-number"}).setText(lineText);
						div.createEl("p", {cls: "codeblock-runner-output-text"}).innerHTML = highlighter.toHtml(line.text);
					}
					button.innerText = "Run Code Block";
				});
			});
		} catch {
			new Notice("Invalid configuration JSON string", 0);
		}
	}
}

function generateProgramConfig(source: any, config: any) {
	let valid = false;
	let language = "NONE";

	if (config.language) {
		language = config.language;
	} else {
		new Notice("A language must be specified for a code block to be runnable", 0);
		return null;
	}

	if (language === "NONE") {
		return null;
	}

	// Ensure that $language exists
	for (const validLanguage of languages) {
		if (language == validLanguage.id) {
			valid = true;
		}
	}

	for (const validAlias of languageAliases) {
		for (const alias of validAlias.aliases) {
			if (language === alias) {
				language = validAlias.language;
				valid = true;
				break;
			}
		}
	}

	if (!valid) {
		new Notice("Language '" + language + "' is not valid. For a list of valid languages, please see the settings page", 0);
		return null;
	}

	let compiler = "NONE";

	// If a compiler is specified, use that
	if (config.compiler) {
		compiler = config.compiler;
	} else {
		for (const defaultCompiler of defaultCompilers) {
			if (language == defaultCompiler.language) {
				compiler = defaultCompiler.compiler;
				break;
			}
		}
	}

	if (compiler == "NONE") {
		new Notice("Compiler '" + compiler + "' is not valid. For a list of valid compilers, please see the settings page", 0);
		return null;
	} else {
		valid = false;
		for (const validCompiler of compilers) {
			if (compiler == validCompiler.id) {
				valid = true;
				break;
			}
		}

		if (!valid) {
			new Notice("Compiler '" + compiler + "' is not valid. For a list of valid compilers, please see the settings page", 0);
			return null;
		}
	}

	let mode = "run";
	if (config.mode) {
		if (["run", "runner", "execute", "r"].includes(config.mode)) {
			mode = "run";
		} else if (["asm", "assembly", "a"].includes(config.mode)) {
			mode = "asm";
		} else {
			new Notice("Mode '" + config.mode + "' is not valid. For a list of valid modes, please see the settings page", 0);
			return null;
		}
	}

	let commandLine = "";
	if (config.commandLine) {
		commandLine = config.commandLine;
	}

	let args = [];
	if (config.args) {
		args = config.args;
	}

	let stdin = []
	if (config.stdin) {
		stdin = config.stdin;
	}

	let tools = [];
	if (config.tools) {
		tools = config.tools;
	}

	let libraries = [];
	if (config.libraries) {
		libraries = config.libraries;
	}

	// If we're just running the code (the default), use a simpler configuration
	if (mode === "asm") {
		return {
			"source": source,
			"compiler": compiler,
			"options": {
				"userArguments": commandLine,
				"executeParameters": {
					"args": args,
					"stdin": stdin
				},
				"compilerOptions": {
					"skipAsm": false,
					"executorRequest": false
				},
				"filters": {
					"binary": false,
					"commentOnly": true,
					"demangle": true,
					"directives": true,
					"execute": false,
					"intel": true,
					"labels": true,
					"libraryCode": false,
					"trim": false
				},
				"tools": tools,
				"libraries": libraries
			},
			"lang": language,
			"allowStoreCodeDebug": true
		};
	} else {
		return {
			"source": source,
			"compiler": compiler,
			"options": {
				"userArguments": commandLine,
				"executeParameters": {
					"args": "",
					"stdin": ""
				},
				"compilerOptions": {
					"executorRequest": true
				},
				"filters": {
					"execute": true
				},
				"tools": tools,
				"libraries": libraries
			},
			"lang": language,
			"allowStoreCodeDebug": true
		}
	}
}

function restfulApiRequest(method: string, url: string, data: object): Promise<any> {
	let toSend = null;

	if (method === "GET") {
		toSend = {
			method: method,
			headers: {
				"Accept": "application/json",
				"Content-Type": "application/json"
			}
		};
	} else {
		toSend = {
			method: method,
			headers: {
				"Accept": "application/json",
				"Content-Type": "application/json"
			},
			body: JSON.stringify(data)
		}
	}

	return fetch("https://godbolt.org" + url, toSend).then(response => response.json()).then(data => {
		return data;
	});
}

async function getLanguages(): Promise<[Language]> {
	return restfulApiRequest("GET", "/api/languages", {});
}

async function getCompilers(languageID?: string): Promise<[Compiler]> {
	if (languageID) {
		return restfulApiRequest("GET", "/api/compilers/" + languageID, {});
	} else {
		return restfulApiRequest("GET", "/api/compilers", {});
	}
}

async function compileProgramConfig(config: any): Promise<CompileResult> {
	return restfulApiRequest("POST", "/api/compiler/" + config.compiler + "/compile", config);
}
