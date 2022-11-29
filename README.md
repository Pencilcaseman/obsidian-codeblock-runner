# CodeBlock Runner

The CodeBlock Runner project for [Obsidian.md](https://obsidian.md) provides a simple and intuitive way to compile and run code from directly within Obsidian.

Making use of the [GodBolt Compiler Explorer API](https://godbolt.org/) and Obsidian's Markdown features, it's possible to extract code blocks, identify the langauge they're written in and run the code remotely, sending the output back to your device.

---

## Basic Usage

The most basic usage of this Obsidian plugin is to simply create a code block and hit run!

For example, when provided with the following code block inside Obsidian:

````markdown
```python
print("Hello, World!")
```
````

the plugin create a button which runs the code!

<p align="center">
<img src="https://github.com/pencilcaseman/codeblock-runner/blob/master/img/hello_world_simple.png" width="800">
</p>

This will also work for a huge number of other languages, such as C++. Simply change the language used in the code block:

<p align="center">
<img src="https://github.com/pencilcaseman/codeblock-runner/blob/master/img/hello_world_simple_cpp.png" width="800">
</p>

---

## More Advanced Usage

In addition to providing the simple interface shown above, this plugin also allows you to specify more advanced arguments at the top of your program using a JSON string.

To specify these arguments, place the JSON object inside some `<compile> ... </compile>` tags at the top of your program.

For example:

```cpp
<compile>
{
    "mode": "run",
    "language": "c++",
    "libraries": [
        {"id": "fmt", "version": "trunk"}
    ]
}
</compile>

// The rest of your program
```

### Specifying the Compiler

The compiler (or interpreter/bytecode-generator) can be specified with the `"compiler"` field inside the JSON object. This must be a valid identifier for a Godbolt compiler. For example, `"python311"` (Python 3.11) or `"g95"` (g++ 9.5)

### Specifying the Language

Exactly like specifying the compiler, the language can be specified with the `"language"` element of the JSON object.

### Specifying Libraries and Tools

Libraries and tools can be specified with the `"libraries"` and `"tools"` options. The request libraries and tools must be supported by the Godbolt Compiler Explorer.

**More work is required on documenting valid values for these optoins. If anyone would like to help with this, it would be greatly appreciated!**

### Viewing Disassembly

The plugin also supports the generation of compiled/intermediate results, such as assembly language or bytecode. This can be controlled by setting the `"mode"` option to either `"run"` or `"asm"`, for running the code or generating assembly respectively.

<p align="center">
<img src="https://github.com/pencilcaseman/codeblock-runner/blob/master/img/python_disassembly.png" width="800">
</p>
