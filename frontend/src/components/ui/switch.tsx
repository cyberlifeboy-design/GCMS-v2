import * as React from "react"
import { cn } from "@/lib/utils"

interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'checked' | 'onChange'> {
    checked?: boolean
    onCheckedChange?: (checked: boolean) => void
}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
    ({ className, checked, onCheckedChange, disabled, ...props }, ref) => {
        return (
            <label className={cn("inline-flex items-center cursor-pointer", disabled && "cursor-not-allowed opacity-50")}>
                <input
                    type="checkbox"
                    ref={ref}
                    checked={checked}
                    disabled={disabled}
                    onChange={(e) => onCheckedChange?.(e.target.checked)}
                    className="sr-only"
                    {...props}
                />
                <div
                    className={cn(
                        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        checked ? "bg-primary" : "bg-input",
                        className
                    )}
                >
                    <span
                        className={cn(
                            "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out",
                            checked ? "translate-x-5" : "translate-x-0"
                        )}
                    />
                </div>
            </label>
        )
    }
)
Switch.displayName = "Switch"

export { Switch }