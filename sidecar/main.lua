io.stdout:setvbuf("no")

local function json_escape(s)
    return s:gsub('\\', '\\\\'):gsub('"', '\\"'):gsub('\n', '\\n'):gsub('\r', '\\r'):gsub('\t', '\\t')
end

local function json_encode(v)
    local t = type(v)
    if t == "nil" then return "null" end
    if t == "boolean" then return v and "true" or "false" end
    if t == "number" then return tostring(v) end
    if t == "string" then return '"' .. json_escape(v) .. '"' end
    if t == "table" then
        local parts = {}
        for k, val in pairs(v) do
            parts[#parts+1] = '"' .. json_escape(tostring(k)) .. '":' .. json_encode(val)
        end
        return "{" .. table.concat(parts, ",") .. "}"
    end
    error("unencodable type: " .. t)
end

local function parse_request(line)
    local id = line:match('"id"%s*:%s*(%d+)')
    local cmd = line:match('"command"%s*:%s*"([^"]+)"')
    return tonumber(id), cmd
end

local handlers = {}

function handlers.ping()
    return { ok = true }
end

function handlers.version()
    return {
        lua = _VERSION,
        jit = (jit and jit.version) or "no jit",
    }
end

local function respond(id, result, err)
    local payload
    if err then
        payload = json_encode({ id = id, error = err })
    else
        payload = json_encode({ id = id, result = result })
    end
    io.write(payload, "\n")
    io.flush()
end

for line in io.lines() do
    local id, cmd = parse_request(line)
    if not id or not cmd then
        respond(id or 0, nil, "malformed request")
    elseif not handlers[cmd] then
        respond(id, nil, "unknown command: " .. cmd)
    else
        local ok, result = pcall(handlers[cmd])
        if ok then respond(id, result)
        else respond(id, nil, tostring(result)) end
    end
end
