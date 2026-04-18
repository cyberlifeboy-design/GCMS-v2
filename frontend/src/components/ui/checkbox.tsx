import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
    checked?: boolean
    onCheckedChange?: (checked: boolean) => void
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
    ({ className, checked, onCheckedChange, disabled, ...props }, ref) => {
        return (
            <label className={cn("inline-flex items-center justify-center cursor-pointer", disabled && "cursor-not-allowed opacity-50")}>
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
                        "h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        checked ? "bg-primary text-primary-foreground" : "bg-background",
                        className
                    )}
                >
                    {checked && (
                        <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />
                    )}
                </div>
            </label>
        )
    }
)
Checkbox.displayName = "Checkbox"

export { Checkbox }