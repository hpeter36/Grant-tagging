import * as React from "react";
import {
  Controller,
  type FieldValues,
  type UseFormReturn,
  useFormContext,
} from "react-hook-form";
import { cn } from "../../lib/utils";

export interface FormProps<TFieldValues extends FieldValues = FieldValues> {
  form: UseFormReturn<TFieldValues>;
  children: React.ReactNode;
  onSubmit: (values: TFieldValues) => void | Promise<void>;
}

export function Form<TFieldValues extends FieldValues>({
  form,
  children,
  onSubmit,
}: FormProps<TFieldValues>) {
  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="space-y-5"
      noValidate
    >
      {children}
    </form>
  );
}

export const FormField = Controller;

export function FormItem({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("space-y-1", className)} {...props} />
  );
}

export function FormLabel(props: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70")}
      {...props}
    />
  );
}

export function FormControl(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} />;
}

export function FormMessage({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  const {
    formState: { errors },
  } = useFormContext();

  if (!children && Object.keys(errors).length === 0) {
    return null;
  }

  return (
    <p className={cn("text-xs text-red-600 mt-1", className)}>
      {children}
    </p>
  );
}


