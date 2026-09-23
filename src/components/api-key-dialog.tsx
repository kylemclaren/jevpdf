import { useState } from "react"
import { EyeIcon, EyeOffIcon, ShieldCheckIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  clearApiKey,
  isRemembered,
  isValidApiKey,
  maskApiKey,
  setApiKey,
} from "@/lib/api-key"

export function ApiKeyDialog({
  open,
  currentKey,
  serverKey,
  onClose,
}: {
  open: boolean
  currentKey: string | null
  /** The server has its own key, so a personal one is optional. */
  serverKey: boolean | null
  onClose: (saved: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent className="sm:max-w-md">
        {/* Remount per open so the form starts from the stored state. */}
        {open && (
          <KeyForm currentKey={currentKey} serverKey={serverKey} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function KeyForm({
  currentKey,
  serverKey,
  onClose,
}: {
  currentKey: string | null
  serverKey: boolean | null
  onClose: (saved: boolean) => void
}) {
  const [value, setValue] = useState("")
  const [reveal, setReveal] = useState(false)
  const [remember, setRemember] = useState(currentKey ? isRemembered() : true)
  const [touched, setTouched] = useState(false)
  const valid = isValidApiKey(value)

  const save = () => {
    setTouched(true)
    if (!valid) return
    setApiKey(value, remember)
    onClose(true)
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <DialogHeader>
        <DialogTitle className="font-heading text-lg">TypeSafe API key</DialogTitle>
        <DialogDescription>
          {serverKey ? "Optional. " : ""}Get one at{" "}
          <a
            href="https://typesafe.ai"
            target="_blank"
            rel="noreferrer"
            className="text-foreground underline underline-offset-2"
          >
            typesafe.ai
          </a>
          .
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-2">
        {currentKey && (
          <Label htmlFor="typesafe-key" className="font-normal text-muted-foreground">
            Current: {maskApiKey(currentKey)}
          </Label>
        )}
        <div className="relative">
          <Input
            id="typesafe-key"
            type={reveal ? "text" : "password"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => value && setTouched(true)}
            placeholder="apikey_…"
            autoComplete="off"
            autoFocus
            spellCheck={false}
            aria-label="TypeSafe API key"
            aria-invalid={touched && !valid}
            className="pr-10 font-mono text-[13px]"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground"
            aria-label={reveal ? "Hide key" : "Show key"}
            onClick={() => setReveal((r) => !r)}
          >
            {reveal ? <EyeOffIcon /> : <EyeIcon />}
          </Button>
        </div>
        {touched && !valid && (
          <p className="text-xs text-destructive">
            Keys start with apikey_
          </p>
        )}
      </div>

      <label className="flex items-center justify-between gap-3 text-sm">
        <span>Remember on this device</span>
        <Switch checked={remember} onCheckedChange={setRemember} />
      </label>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheckIcon className="size-3.5 shrink-0" />
        Stays in this browser. Never stored or logged by the server.
      </p>

      <DialogFooter className="gap-2 sm:justify-between">
        {currentKey ? (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              clearApiKey()
              onClose(false)
            }}
          >
            Forget
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={!value.trim()}>
          Save
        </Button>
      </DialogFooter>
    </form>
  )
}
