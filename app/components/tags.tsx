export function Tags({ categories }: { categories: string[] }) {
  return (
    <div className='tags'>
      {categories.map((name) => (
        <span className='tag' key={name}>
          {name}
        </span>
      ))}
    </div>
  )
}
